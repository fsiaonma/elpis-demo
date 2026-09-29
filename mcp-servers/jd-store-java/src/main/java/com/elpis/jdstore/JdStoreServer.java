package com.elpis.jdstore;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class JdStoreServer {
  private static final Gson GSON = new Gson();

  public static void main(String[] args) {
    log("jd-store ready");
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        line = line.trim();
        if (line.isEmpty()) {
          continue;
        }
        try {
          handleMessage(JsonParser.parseString(line).getAsJsonObject());
        } catch (JsonSyntaxException | IllegalStateException exception) {
          log("invalid json-rpc message: " + exception.getMessage());
        }
      }
    } catch (Exception exception) {
      log("jd-store failed: " + exception.getMessage());
    }
  }

  private static void handleMessage(JsonObject message) {
    String method = message.has("method") && !message.get("method").isJsonNull()
        ? message.get("method").getAsString()
        : null;
    JsonElement idElement = message.get("id");

    if ("initialize".equals(method)) {
      sendResult(idElement, initializeResult());
      return;
    }

    if ("notifications/initialized".equals(method)) {
      return;
    }

    if ("tools/list".equals(method)) {
      sendResult(idElement, toolsListResult());
      return;
    }

    if ("tools/call".equals(method)) {
      handleToolsCall(idElement, message.getAsJsonObject("params"));
      return;
    }

    if (method != null) {
      sendError(idElement, -32601, "Method not found: " + method);
    }
  }

  private static JsonObject initializeResult() {
    JsonObject serverInfo = new JsonObject();
    serverInfo.addProperty("name", "jd-store");
    serverInfo.addProperty("version", "0.1.0");

    JsonObject capabilities = new JsonObject();
    capabilities.add("tools", new JsonObject());

    JsonObject result = new JsonObject();
    result.addProperty("protocolVersion", "2025-03-26");
    result.add("capabilities", capabilities);
    result.add("serverInfo", serverInfo);
    return result;
  }

  private static JsonObject toolsListResult() {
    JsonArray tools = new JsonArray();
    tools.add(buildTool(
        "list_jobs",
        "List jobs from MySQL t_job with optional keyword and limit.",
        schemaWithOptional("keyword", "string", "limit", "integer")
    ));
    tools.add(buildTool(
        "get_job_requirements",
        "Get trimmed requirements for a job; weight comes from rules/weights.json.",
        schemaWithRequired("jobId", "string")
    ));
    tools.add(buildTool(
        "score_match",
        "Score resume verdicts against a job using deterministic rules engine.",
        scoreMatchSchema()
    ));

    JsonObject result = new JsonObject();
    result.add("tools", tools);
    return result;
  }

  private static void handleToolsCall(JsonElement idElement, JsonObject params) {
    String name = params.has("name") ? params.get("name").getAsString() : "";
    long started = System.currentTimeMillis();
    log("tools/call " + name + " begin");

    try {
      JsonObject arguments = params.has("arguments") && params.get("arguments").isJsonObject()
          ? params.get("arguments").getAsJsonObject()
          : new JsonObject();
      Object payload = switch (name) {
        case "list_jobs" -> listJobs(arguments);
        case "get_job_requirements" -> getJobRequirements(arguments);
        case "score_match" -> scoreMatch(arguments);
        default -> throw new IllegalArgumentException("unknown tool: " + name);
      };
      long elapsed = System.currentTimeMillis() - started;
      log("tools/call " + name + " end " + elapsed + "ms");
      sendToolResult(idElement, payload);
    } catch (Exception exception) {
      long elapsed = System.currentTimeMillis() - started;
      log("tools/call " + name + " end " + elapsed + "ms error=" + exception.getMessage());
      sendError(idElement, -32000, exception.getMessage());
    }
  }

  private static List<Map<String, Object>> listJobs(JsonObject arguments) throws SQLException {
    String keyword = getOptionalString(arguments, "keyword");
    Integer limit = arguments.has("limit") && !arguments.get("limit").isJsonNull()
        ? arguments.get("limit").getAsInt()
        : null;
    int resolvedLimit = limit == null || limit <= 0 ? 50 : Math.min(limit, 300);
    String pattern = keyword == null || keyword.isBlank() ? null : "%" + keyword.trim() + "%";

    String sql = """
        SELECT id, title, company, city, level
        FROM t_job
        %s
        ORDER BY created_at DESC
        LIMIT ?
        """.formatted(pattern == null ? "" : "WHERE title LIKE ? OR company LIKE ? OR city LIKE ?");

    List<Map<String, Object>> items = new ArrayList<>();
    try (Connection connection = openConnection();
         PreparedStatement statement = connection.prepareStatement(sql)) {
      int parameterIndex = 1;
      if (pattern != null) {
        statement.setString(parameterIndex++, pattern);
        statement.setString(parameterIndex++, pattern);
        statement.setString(parameterIndex++, pattern);
      }
      statement.setInt(parameterIndex, resolvedLimit);

      try (ResultSet resultSet = statement.executeQuery()) {
        while (resultSet.next()) {
          Map<String, Object> item = new LinkedHashMap<>();
          item.put("jobId", resultSet.getString("id"));
          item.put("title", resultSet.getString("title"));
          item.put("company", resultSet.getString("company"));
          item.put("city", resultSet.getString("city"));
          item.put("level", resultSet.getString("level"));
          items.add(item);
        }
      }
    }
    return items;
  }

  private static Map<String, Object> getJobRequirements(JsonObject arguments) throws SQLException {
    String jobId = requireString(arguments, "jobId");
    Map<String, Object> job = fetchJobHeader(jobId);
    if (job == null) {
      throw new IllegalArgumentException("job not found: " + jobId);
    }

    JsonObject weights = ScoringEngine.loadWeights();
    List<Map<String, Object>> requirements = fetchRequirements(jobId);
    List<Map<String, Object>> trimmed = new ArrayList<>();
    for (Map<String, Object> requirement : requirements) {
      String dimension = requirement.get("dimension") == null ? null : String.valueOf(requirement.get("dimension"));
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("id", requirement.get("id"));
      item.put("text", requirement.get("text"));
      item.put("kind", requirement.get("kind"));
      item.put("dimension", requirement.get("dimension"));
      item.put("weight", ScoringEngine.weightForDimension(weights, dimension));
      trimmed.add(item);
    }

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("jobId", job.get("id"));
    response.put("title", job.get("title"));
    response.put("requirements", trimmed);
    return response;
  }

  private static Map<String, Object> scoreMatch(JsonObject arguments) throws SQLException {
    String jobId = requireString(arguments, "jobId");
    if (fetchJobHeader(jobId) == null) {
      throw new IllegalArgumentException("job not found: " + jobId);
    }

    JsonArray verdictArray = arguments.has("verdicts") && arguments.get("verdicts").isJsonArray()
        ? arguments.get("verdicts").getAsJsonArray()
        : new JsonArray();
    List<Map<String, Object>> verdicts = new ArrayList<>();
    for (JsonElement element : verdictArray) {
      JsonObject verdictObject = element.getAsJsonObject();
      Map<String, Object> verdict = new LinkedHashMap<>();
      verdict.put("requirementId", requireString(verdictObject, "requirementId"));
      verdict.put("verdict", getOptionalString(verdictObject, "verdict"));
      verdict.put("evidence", getOptionalString(verdictObject, "evidence"));
      verdicts.add(verdict);
    }

    return ScoringEngine.score(jobId, fetchRequirements(jobId), verdicts);
  }

  private static Map<String, Object> fetchJobHeader(String jobId) throws SQLException {
    String sql = "SELECT id, title FROM t_job WHERE id = ?";
    try (Connection connection = openConnection();
         PreparedStatement statement = connection.prepareStatement(sql)) {
      statement.setString(1, jobId);
      try (ResultSet resultSet = statement.executeQuery()) {
        if (!resultSet.next()) {
          return null;
        }
        Map<String, Object> job = new LinkedHashMap<>();
        job.put("id", resultSet.getString("id"));
        job.put("title", resultSet.getString("title"));
        return job;
      }
    }
  }

  private static List<Map<String, Object>> fetchRequirements(String jobId) throws SQLException {
    String sql = """
        SELECT id, text, kind, dimension
        FROM t_job_requirement
        WHERE job_id = ?
        ORDER BY id
        """;

    List<Map<String, Object>> requirements = new ArrayList<>();
    try (Connection connection = openConnection();
         PreparedStatement statement = connection.prepareStatement(sql)) {
      statement.setString(1, jobId);
      try (ResultSet resultSet = statement.executeQuery()) {
        while (resultSet.next()) {
          Map<String, Object> requirement = new LinkedHashMap<>();
          requirement.put("id", resultSet.getString("id"));
          requirement.put("text", resultSet.getString("text"));
          requirement.put("kind", resultSet.getString("kind"));
          requirement.put("dimension", resultSet.getString("dimension"));
          requirements.add(requirement);
        }
      }
    }
    return requirements;
  }

  private static Connection openConnection() throws SQLException {
    String url = env(
        "MYSQL_URL",
        "jdbc:mysql://127.0.0.1:3306/zteam?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC"
    );
    return DriverManager.getConnection(url, env("MYSQL_USER", "root"), env("MYSQL_PASSWORD", ""));
  }

  private static String env(String key, String fallback) {
    String value = System.getenv(key);
    return value == null || value.isBlank() ? fallback : value;
  }

  private static JsonObject buildTool(String name, String description, JsonObject inputSchema) {
    JsonObject tool = new JsonObject();
    tool.addProperty("name", name);
    tool.addProperty("description", description);
    tool.add("inputSchema", inputSchema);
    return tool;
  }

  private static JsonObject schemaWithRequired(String key, String type) {
    JsonObject properties = new JsonObject();
    JsonObject field = new JsonObject();
    field.addProperty("type", type);
    properties.add(key, field);

    JsonArray required = new JsonArray();
    required.add(key);

    JsonObject schema = new JsonObject();
    schema.addProperty("type", "object");
    schema.add("properties", properties);
    schema.add("required", required);
    return schema;
  }

  private static JsonObject schemaWithOptional(String key1, String type1, String key2, String type2) {
    JsonObject properties = new JsonObject();
    JsonObject first = new JsonObject();
    first.addProperty("type", type1);
    properties.add(key1, first);
    JsonObject second = new JsonObject();
    second.addProperty("type", type2);
    properties.add(key2, second);

    JsonObject schema = new JsonObject();
    schema.addProperty("type", "object");
    schema.add("properties", properties);
    return schema;
  }

  private static JsonObject scoreMatchSchema() {
    JsonObject requirementId = new JsonObject();
    requirementId.addProperty("type", "string");
    JsonObject verdict = new JsonObject();
    verdict.addProperty("type", "string");
    JsonObject evidence = new JsonObject();
    evidence.addProperty("type", "string");

    JsonObject verdictProperties = new JsonObject();
    verdictProperties.add("requirementId", requirementId);
    verdictProperties.add("verdict", verdict);
    verdictProperties.add("evidence", evidence);

    JsonArray verdictRequired = new JsonArray();
    verdictRequired.add("requirementId");
    verdictRequired.add("verdict");

    JsonObject verdictItem = new JsonObject();
    verdictItem.addProperty("type", "object");
    verdictItem.add("properties", verdictProperties);
    verdictItem.add("required", verdictRequired);

    JsonObject verdicts = new JsonObject();
    verdicts.addProperty("type", "array");
    verdicts.add("items", verdictItem);

    JsonObject jobId = new JsonObject();
    jobId.addProperty("type", "string");

    JsonObject properties = new JsonObject();
    properties.add("jobId", jobId);
    properties.add("verdicts", verdicts);

    JsonArray required = new JsonArray();
    required.add("jobId");
    required.add("verdicts");

    JsonObject schema = new JsonObject();
    schema.addProperty("type", "object");
    schema.add("properties", properties);
    schema.add("required", required);
    return schema;
  }

  private static String requireString(JsonObject object, String key) {
    if (!object.has(key) || object.get(key).isJsonNull()) {
      throw new IllegalArgumentException(key + " is required");
    }
    return object.get(key).getAsString();
  }

  private static String getOptionalString(JsonObject object, String key) {
    if (!object.has(key) || object.get(key).isJsonNull()) {
      return null;
    }
    return object.get(key).getAsString();
  }

  private static void sendToolResult(JsonElement idElement, Object payload) {
    JsonObject contentItem = new JsonObject();
    contentItem.addProperty("type", "text");
    contentItem.addProperty("text", GSON.toJson(payload));

    JsonArray content = new JsonArray();
    content.add(contentItem);

    JsonObject result = new JsonObject();
    result.add("content", content);
    result.addProperty("isError", false);
    sendResult(idElement, result);
  }

  private static void sendResult(JsonElement idElement, JsonObject result) {
    JsonObject response = new JsonObject();
    response.addProperty("jsonrpc", "2.0");
    response.add("id", idElement);
    response.add("result", result);
    writeResponse(response);
  }

  private static void sendError(JsonElement idElement, int code, String message) {
    JsonObject error = new JsonObject();
    error.addProperty("code", code);
    error.addProperty("message", message);

    JsonObject response = new JsonObject();
    response.addProperty("jsonrpc", "2.0");
    response.add("id", idElement);
    response.add("error", error);
    writeResponse(response);
  }

  private static void writeResponse(JsonObject response) {
    System.out.println(GSON.toJson(response));
    System.out.flush();
  }

  private static void log(String message) {
    System.err.println(message);
    System.err.flush();
  }
}

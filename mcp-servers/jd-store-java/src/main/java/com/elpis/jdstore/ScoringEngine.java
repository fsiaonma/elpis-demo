package com.elpis.jdstore;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class ScoringEngine {
  private ScoringEngine() {}

  public static Map<String, Object> score(
      String jobId,
      List<Map<String, Object>> requirements,
      List<Map<String, Object>> verdicts
  ) {
    JsonObject weights = loadWeights();
    Map<String, String> verdictMap = new HashMap<>();
    for (Map<String, Object> verdict : verdicts) {
      Object requirementId = verdict.get("requirementId");
      if (requirementId != null) {
        verdictMap.put(String.valueOf(requirementId), normalizeVerdict((String) verdict.get("verdict")));
      }
    }

    boolean disqualifyOnHardMiss = weights.getAsJsonObject("hardGates").get("disqualifyOnHardMiss").getAsBoolean();
    List<String> hardFailures = new ArrayList<>();
    for (Map<String, Object> requirement : requirements) {
      if (!"hard".equalsIgnoreCase(String.valueOf(requirement.get("kind")))) {
        continue;
      }
      String requirementId = String.valueOf(requirement.get("id"));
      if ("miss".equals(verdictMap.getOrDefault(requirementId, "miss"))) {
        hardFailures.add(String.valueOf(requirement.get("text")));
      }
    }

    if (!hardFailures.isEmpty() && disqualifyOnHardMiss) {
      Map<String, Object> result = new LinkedHashMap<>();
      result.put("jobId", jobId);
      result.put("total", null);
      result.put("items", List.of());
      result.put("disqualified", true);
      result.put("disqualifiedReason", String.join("；", hardFailures));
      return result;
    }

    double totalWeight = 0.0;
    double totalContribution = 0.0;
    List<Map<String, Object>> items = new ArrayList<>();

    for (Map<String, Object> requirement : requirements) {
      String requirementId = String.valueOf(requirement.get("id"));
      String dimension = requirement.get("dimension") == null ? null : String.valueOf(requirement.get("dimension"));
      double weight = weightForDimension(weights, dimension);
      String verdict = verdictMap.getOrDefault(requirementId, "miss");
      double coefficient = coefficientForVerdict(weights, verdict);
      double contribution = weight * coefficient;
      totalWeight += weight;
      totalContribution += contribution;

      Map<String, Object> item = new LinkedHashMap<>();
      item.put("requirementId", requirementId);
      item.put("verdict", verdict);
      item.put("weight", round(weight));
      item.put("contribution", round(contribution));
      items.add(item);
    }

    double total = totalWeight > 0 ? (totalContribution / totalWeight) * 100.0 : 0.0;
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("jobId", jobId);
    result.put("total", round(total));
    result.put("items", items);
    result.put("disqualified", false);
    result.put("disqualifiedReason", null);
    return result;
  }

  public static JsonObject loadWeights() {
    return JsonParser.parseString(readWeightsJson()).getAsJsonObject();
  }

  public static double weightForDimension(JsonObject weights, String dimension) {
    double fallback = weights.get("defaultDimensionWeight").getAsDouble();
    if (dimension == null || dimension.isBlank()) {
      return fallback;
    }
    JsonObject dimensionWeights = weights.getAsJsonObject("dimensionWeights");
    if (dimensionWeights.has(dimension)) {
      return dimensionWeights.get(dimension).getAsDouble();
    }
    return fallback;
  }

  private static String readWeightsJson() {
    String configured = System.getenv("JD_WEIGHTS_PATH");
    if (configured != null && !configured.isBlank()) {
      return readFile(Path.of(configured));
    }

    for (String relative : new String[] {"rules/weights.json", "src/main/resources/rules/weights.json"}) {
      Path candidate = Path.of(System.getProperty("user.dir"), relative);
      if (Files.isRegularFile(candidate)) {
        return readFile(candidate);
      }
    }

    try (InputStream input = ScoringEngine.class.getClassLoader().getResourceAsStream("rules/weights.json")) {
      if (input == null) {
        throw new IllegalStateException("rules/weights.json not found");
      }
      return new String(input.readAllBytes(), StandardCharsets.UTF_8);
    } catch (IOException exception) {
      throw new IllegalStateException("failed to read classpath rules/weights.json", exception);
    }
  }

  private static String readFile(Path path) {
    try {
      return Files.readString(path, StandardCharsets.UTF_8);
    } catch (IOException exception) {
      throw new IllegalStateException("failed to read weights file: " + path, exception);
    }
  }

  private static double coefficientForVerdict(JsonObject weights, String verdict) {
    JsonObject coefficients = weights.getAsJsonObject("verdictCoefficients");
    if (coefficients.has(verdict)) {
      return coefficients.get(verdict).getAsDouble();
    }
    return coefficients.get("miss").getAsDouble();
  }

  private static String normalizeVerdict(String verdict) {
    if (verdict == null || verdict.isBlank()) {
      return "miss";
    }
    return verdict.trim().toLowerCase(Locale.ROOT);
  }

  private static double round(double value) {
    return Math.round(value * 10000.0) / 10000.0;
  }
}

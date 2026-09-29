import md5 from 'md5';

const SIGN_KEY = 'klx05hb3n1c9ujp8uhxbs2ikkiowp212';

export function buildSignedHeaders() {
  const st = Date.now();
  return {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    s_t: String(st),
    s_sign: md5(`${SIGN_KEY}_${st}`),
  };
}

export async function postAgentStream({ apiBase, agent, input, threadId, signal }) {
  const base = apiBase.replace(/\/$/, '');
  const body = { agent, input };
  if (threadId) {
    body.threadId = threadId;
  }

  const response = await fetch(`${base}/agent/run/stream`, {
    method: 'POST',
    headers: buildSignedHeaders(),
    credentials: 'include',
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error('浏览器不支持流式响应');
  }

  return response;
}

export async function consumeSseStream(response, { onEvent, onError }) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let currentEvent = 'message';
  let dataLines = [];

  const dispatch = () => {
    if (dataLines.length === 0) {
      currentEvent = 'message';
      return;
    }

    const raw = dataLines.join('\n');
    const eventName = currentEvent;
    dataLines = [];
    currentEvent = 'message';

    try {
      onEvent(eventName, JSON.parse(raw));
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('SSE JSON 解析失败'));
    }
  };

  const processLine = (line) => {
    if (line === '') {
      dispatch();
      return;
    }

    if (line.startsWith(':')) {
      return;
    }

    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
      return;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith('\r')) {
        line = line.slice(0, -1);
      }
      processLine(line);
      newlineIndex = buffer.indexOf('\n');
    }
  }

  if (buffer.length > 0) {
    const line = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
    processLine(line);
  }

  dispatch();
}

export function supplementSteps(currentSteps, finalSteps) {
  if (!Array.isArray(finalSteps) || finalSteps.length === 0) {
    return currentSteps;
  }

  if (!Array.isArray(currentSteps) || currentSteps.length >= finalSteps.length) {
    return currentSteps;
  }

  return [...currentSteps, ...finalSteps.slice(currentSteps.length)];
}

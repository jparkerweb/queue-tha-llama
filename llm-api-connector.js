// ------------------------------------------------------------------
// Description: Javascript API connector for llama.cpp
// orginal source: https://github.com/ggerganov/llama.cpp/blob/master/examples/server/public/completion.js
// ------------------------------------------------------------------

// import environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

const LLM_SERVER_API = process.env.LLM_SERVER_API || "llama";
const LLAMA_SERVER_URL = process.env.LLAMA_SERVER_URL || "http:127.0.0.1:8080";
const LLM_SERVER_TEMPERATURE = parseFloat(process.env.LLM_SERVER_TEMPERATURE) || 0.1;
const LLM_SERVER_STOP_TOKENS = JSON.parse(process.env.LLM_SERVER_STOP_TOKENS) || ["</s>", "LLM:", "USER:"];
const TOGETHER_API_URL = process.env.TOGETHER_API_URL || "https://api.together.ai/v1/complete";
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY || "";
const TOGETHER_MODEL = process.env.TOGETHER_MODEL || "teknium/OpenHermes-2p5-Mistral-7B";

let generation_settings = null;


// Completes the prompt as a generator. Recommended for most use cases.
//
// Example:
//
//    import { llama } from '/completion.js'
//
//    const request = llama("Tell me a joke", {n_predict: 800})
//    for await (const chunk of request) {
//      document.write(chunk.data.content)
//    }
//
export async function* llama(prompt, params = {}, config = {}) {
  let controller = config.controller;

  if (!controller) { controller = new AbortController(); }  
  let response;

  if (LLM_SERVER_API === 'llama') {
    // parameters for llama.cpp
    const paramDefaults = {
      stream: true,
      n_predict: 500,
      temperature: LLM_SERVER_TEMPERATURE,
      stop: LLM_SERVER_STOP_TOKENS,
    };

    const completionParams = { ...paramDefaults, ...params, prompt };

    response = await fetch(`${LLAMA_SERVER_URL}/completion`, {
      method: 'POST',
      body: JSON.stringify(completionParams),
      headers: {
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...(params.api_key ? {'Authorization': `Bearer ${params.api_key}`} : {})
      },
      signal: controller.signal,
    });

  } else if (LLM_SERVER_API === 'together') {
    // parameters for the Together.ai
    const paramDefaults = {
      model: TOGETHER_MODEL,
      max_tokens: 500,
      prompt: prompt,
      temperature: LLM_SERVER_TEMPERATURE,
      top_p: 0.7,
      top_k: 50,
      repetition_penalty: 1,
      stream_tokens: true,
      stop: LLM_SERVER_STOP_TOKENS
    };

    const completionParams = { ...paramDefaults, ...params, prompt };

    response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      body: JSON.stringify(completionParams),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      },
      signal: controller.signal,
    })

  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let content = "";
  let leftover = ""; // Buffer for partially read lines

  try {
    let cont = true;

    while (cont) {
      const result = await reader.read();
      if (result.done) {
        break;
      }

      // Add any leftover data to the current chunk of data
      const text = leftover + decoder.decode(result.value);

      // Check if the last character is a line break
      const endsWithLineBreak = text.endsWith('\n');

      // Split the text into lines
      let lines = text.split('\n');

      // If the text doesn't end with a line break, then the last line is incomplete
      // Store it in leftover to be added to the next chunk of data
      if (!endsWithLineBreak) {
        leftover = lines.pop();
      } else {
        leftover = ""; // Reset leftover if we have a line break at the end
      }

      // Parse all sse events and add them to result
      const regex = /^(\S+):\s(.*)$/gm;
      for (const line of lines) {
        const match = regex.exec(line);
        if (match) {
          result[match[1]] = match[2]
          // since we know this is llama.cpp, let's just decode the json in data
          if (result.data) {
            // if useing together ai and we recieve a stop token, we should stop
            if (LLM_SERVER_API === 'together' && result.data === "[DONE]") {
              cont = false;
              break;
            }

            result.data = JSON.parse(result.data);
            if (LLM_SERVER_API === 'llama') {
              content += result.data.content;
            } else if (LLM_SERVER_API === 'together') {
              content += result.data.token.text;
            }

            // yield
            yield result;

            // if we got a stop token from server, we will break here
            if (result.data.stop) {
              if (result.data.generation_settings) {
                generation_settings = result.data.generation_settings;
              }
              cont = false;
              break;
            }
          }
          if (result.error) {
            result.error = JSON.parse(result.error);
            if (result.error.content.includes('slot unavailable')) {
              // Throw an error to be caught by upstream callers
              throw new Error('slot unavailable');
            } else {
              console.error(`llama.cpp error: ${result.error.content}`);
            }
          }
          if (result.error) {
            result.error = JSON.parse(result.error);
            console.error(`llama.cpp error: ${result.error.content}`);
          }
        }
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error("llama error: ", e);
    }
    throw e;
  }
  finally {
    controller.abort();
  }

  return content;
}

// Call llama, return an event target that you can subscribe to
//
// Example:
//
//    import { llamaEventTarget } from '/completion.js'
//
//    const conn = llamaEventTarget(prompt)
//    conn.addEventListener("message", (chunk) => {
//      document.write(chunk.detail.content)
//    })
//
export const llamaEventTarget = (prompt, params = {}, config = {}) => {
  const eventTarget = new EventTarget();
  (async () => {
    let content = "";
    for await (const chunk of llama(prompt, params, config)) {
      if (chunk.data) {
        content += chunk.data.content;
        eventTarget.dispatchEvent(new CustomEvent("message", { detail: chunk.data }));
      }
      if (chunk.data.generation_settings) {
        eventTarget.dispatchEvent(new CustomEvent("generation_settings", { detail: chunk.data.generation_settings }));
      }
      if (chunk.data.timings) {
        eventTarget.dispatchEvent(new CustomEvent("timings", { detail: chunk.data.timings }));
      }
    }
    eventTarget.dispatchEvent(new CustomEvent("done", { detail: { content } }));
  })();
  return eventTarget;
}

// Call llama, return a promise that resolves to the completed text. This does not support streaming
//
// Example:
//
//     llamaPromise(prompt).then((content) => {
//       document.write(content)
//     })
//
//     or
//
//     const content = await llamaPromise(prompt)
//     document.write(content)
//
export const llamaPromise = (prompt, params = {}, config = {}) => {
  return new Promise(async (resolve, reject) => {
    let content = "";
    try {
      for await (const chunk of llama(prompt, params, config)) {
        content += chunk.data.content;
      }
      resolve(content);
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * (deprecated)
 */
export const llamaComplete = async (params, controller, callback) => {
  for await (const chunk of llama(params.prompt, params, { controller })) {
    callback(chunk);
  }
}

// Get the model info from the server. This is useful for getting the context window and so on.
export const llamaModelInfo = async () => {
  if (!generation_settings) {
    const props = await fetch("/props").then(r => r.json());
    generation_settings = props.default_generation_settings;
  }
  return generation_settings;
}
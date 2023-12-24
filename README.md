# LLM API Queue
message queue workflow and simple UI for multi-user LLM chat

---

## Prerequisites

<div class="🌟 li-margin-bottom-10 li-big-links"></div>

- [Redis](https://redis.io/)
    > pull docker image
    > ```
    > docker pull redis
    > ```
  
    > run redis in docker
    > ```
    > docker run -p 6379:6379 --name my-redis -d redis
    > ```

- Install/Build [llama.cpp](https://github.com/ggerganov/llama.cpp/tree/master/examples/server) with running model of choice
    > server with continuous batching and parallel requests
    > ```
    > .\server.exe -m .\models\7b\mistral-7b-instruct-v0.2.Q4_K_M.gguf -c 2048 -cb -np 2
    > ```

- npm dependencies for this project
    > clone and run this from cloned repo directory
    > ```
    > npm ci
    > ```

---

## Run

- Local web server
    > run local web server (llama server and docker redis must be running)
    > ```
    > npm server.js
    > ```

- Visit local web server page (link displayed on server.js startup)
    default site ⇢ [http://localhost:3000/](http://localhost:3000/)

- Optionally view redis admin dashboard (link displayed on server.js startup)
    default site ⇢ [http://localhost:3000/admin/queues/](http://localhost:3000/admin/queues/)

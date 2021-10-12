
const channel = new BroadcastChannel("chat");

channel.onmessage = (e: MessageEvent) => {
    for (const client of webSockets.values()) {
        client.socket.send(e.data)
    }
}

type Client = {
    id: string
    name: string
    isAlive: boolean
    socket: WebSocket
}

/** connected socket clients mapped by unique id */
const webSockets = new Map<string, Client>()

function broadcast(msg: string) {
    webSockets.forEach(client => {
        client.socket.send(msg);
    })
    channel.postMessage(msg)
}

/** Deploy Environment */
const DEV: boolean = (Deno.env.get("DEV") === "true")
const DEBUG = (Deno.env.get("DEBUG") === "true")
if (DEBUG) console.log(`Env DEV: ${DEV}, DEBUG: ${DEBUG} DEPLOYMENT_ID: ${Deno.env.get("DENO_DEPLOYMENT_ID")}`)


function handleRequest(request: Request) {
    console.info(request.url)
    const upgrade = request.headers.get("upgrade") || "";
    if (upgrade.toLowerCase() === "websocket") {


        const ip = request.headers.get("x-forwarded-for");
        console.log("new websocket connection from", ip);

        const { socket, response } = Deno.upgradeWebSocket(request);
        const client: Client = { id: '', name: '', isAlive: true, socket: socket }
        socket.onopen = () => {
            client.id = request.headers.get('sec-websocket-key') || ""
            if (DEBUG) console.log("Client connected ... id: " + client.id)
            // Register our new socket(user)
            webSockets.set(client.id, client)
        }
        socket.onmessage = (msg) => {
            const data = msg.data
            if (typeof data === 'string') {
                // user registration request?
                if (data.startsWith('Register')) {
                    // get the users name from the data string('Register:John Doe')
                    client.name = data.split(":")[1]// the second value of split-array
                    if (DEBUG) console.log(`${client.name} >> has joined the chat!`)
                    broadcast(`${client.name} >> has joined the chat!`);
                } else if (data === 'ACK') { // watchdog acknowledged
                    if (DEV) console.log(`Recieved watchdog 'ACK' from ${client.name}`)
                    client.isAlive = true
                } else {
                    if (DEBUG) console.log(`${client.name} >> ${msg.data}`)
                    broadcast(`${client.name} >> ${msg.data}`)
                }
            }
        }
        socket.onclose = () => {
            const name = webSockets.get(client.id)?.name || 'someone'
            webSockets.delete(client.id);
            broadcast(`${name} has disconnected`)
            if (DEBUG) console.log(name + " disconnected from chat ...")
        }

        socket.onerror = (err: Event | ErrorEvent) => {
            console.log(err instanceof ErrorEvent ? err.message : err.type)
        }
        return response;
    } else {
        // just swallow non-socket requests
        const msg = `failed to accept websocket for url ${request.url}`
        console.error(msg);
        return new Response(msg)
    }
}

//@ts-ignore ?
addEventListener("fetch", (event: FetchEvent) => {
    event.respondWith(handleRequest(event.request));
});
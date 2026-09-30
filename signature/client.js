const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let registeredUsername = "";
let username = "";
const users = new Map();

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    registeredUsername = input;
    console.log(`Welcome, ${username} to the chat`);

    socket.emit("registerPublicKey", { username, publicKey });
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        if ((match = message.match(/^!impersonate (\w+)$/))) {
          username = match[1];
          console.log(`Now impersonating as ${username}`);
        } else if (message.match(/^!exit$/)) {
          username = registeredUsername;
          console.log(`Now you are ${username}`);
        } else {
          const signature = crypto.sign("sha256", Buffer.from(message), privateKey).toString("hex");
          const payloadString = JSON.stringify({
            text: message,
            signature: signature
          });

          socket.emit("message", { username, message: payloadString });
        }
      }
      rl.prompt();
    });
  });
});

socket.on("init", (keys) => {
  keys.forEach(([user, key]) => users.set(user, key));
  console.log(`\nThere are currently ${users.size} users in the chat`);
  rl.prompt();
});

socket.on("newUser", (data) => {
  const { username, publicKey } = data;
  users.set(username, publicKey);
  console.log(`${username} join the chat`);
  rl.prompt();
});

socket.on("message", (data) => {
  const { username: senderUsername, message: payloadString } = data;
  if (senderUsername !== username) {
    let displayMessage = payloadString;
    let warning = "";

    try {
      const payload = JSON.parse(payloadString);
      displayMessage = payload.text;
      const signature = payload.signature;
      const senderPublicKey = users.get(senderUsername);
      if (senderPublicKey && signature) {
        const isVerified = crypto.verify(
          "sha256", 
          Buffer.from(displayMessage), 
          senderPublicKey, 
          Buffer.from(signature, "hex")
        );
        
        if (!isVerified) {
          warning = " 🚨 [WARNING: THIS USER IS FAKE!]";
        }
      }
    } catch (err) {
      displayMessage = payloadString;
    }

    console.log(`${senderUsername}: ${displayMessage}${warning}`);
    rl.prompt();
  }
});

socket.on("disconnect", () => {
  console.log("Server disconnected, Exiting...");
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});
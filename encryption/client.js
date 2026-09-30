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

let targetUsername = "";
let registeredUsername = "";
let username = "";
const users = new Map();

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    registeredUsername = input;
    console.log(`Welcome, ${username} to the chat`);
    socket.emit("registerPublicKey", {
      username,
      publicKey: publicKey, 
    });
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        if ((match = message.match(/^!secret (\w+)$/))) {
          targetUsername = match[1];
          console.log(`Now secretly chatting with ${targetUsername}`);
        } else if (message.match(/^!exit$/)) {
          console.log(`No more secretly chatting with ${targetUsername}`);
          targetUsername = "";
        } else {
        
          let msgToSend = message;
          let isSecret = false;
          if (targetUsername) {
            const targetPublicKey = users.get(targetUsername);
            if (targetPublicKey) {
              const encryptedBuffer = crypto.publicEncrypt(targetPublicKey, Buffer.from(message));
              msgToSend = encryptedBuffer.toString("hex"); 
              isSecret = true;
            } else {
              console.log(`Error: User ${targetUsername} tidak ditemukan!`);
              rl.prompt();
              return; 
            }
          }
          const payloadString = JSON.stringify({
            isSecret: isSecret,
            target: targetUsername,
            text: msgToSend
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

    try {
      const payload = JSON.parse(payloadString);
      displayMessage = payload.text;
      if (payload.isSecret) {
        if (payload.target === registeredUsername) {
          try {
            const decryptedBuffer = crypto.privateDecrypt(privateKey, Buffer.from(payload.text, "hex"));
            displayMessage = `(Secret) ${decryptedBuffer.toString("utf8")}`;
          } catch (err) {
            displayMessage = `(Secret) [Gagal Dekripsi data!]`;
          }
        } else {
          displayMessage = `[Gibberish Ciphertext] ${payload.text.substring(0, 40)}...`;
        }
      }
    } catch (err) {
    }

    console.log(`${senderUsername}: ${displayMessage}`);
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
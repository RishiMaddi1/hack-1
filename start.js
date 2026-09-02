// Azure App Service sets HOSTNAME to the container id; Next then binds only to
// that address and the front-end proxy returns 502/503. Force 0.0.0.0.
process.env.HOSTNAME = "0.0.0.0";
process.env.PORT = process.env.PORT || process.env.WEBSITES_PORT || "8080";
require("./server.js");

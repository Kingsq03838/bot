var http = require('http');

http.createServer(function (req, res) {
    // This callback function is called whenever a request is received.
    
    res.write("I'm alive"); // Send a response to the client
    res.end(); // End the response
    
}).listen(8080); // The server listens on port 8080

var Paho = require('../lib/mqttws31.js');

/**
 * @file 
 * MQTT base client.
 *
 * Manage connection, subscription and publishing.
 */

//
//
// Global variables
//
//

// MQTT client object representing the connection.
var client;
// Client configuration, stored for reconnection.
var clientConfiguration = {
    hostname: null,
    port: null,
    context: null,
    clientId: null,
    connectOptions: {},
    onConnectionLostCallback: null,
    onMessageArrivedCallback: null,
    onMessageDeliveredCallback: null,
};
var reconnectTimeoutId;
// ConnectOptions to be kept : https://bugs.eclipse.org/bugs/show_bug.cgi?id=476039
//var connectOptions = {};
// Local connection status
var connected = false;
// Auto reconnect switch
var autoReconnect = true;
// Wait time in ms before attempting to reconnect upon connection lost occurs (default to 10000)
var reconnectTimeout = process.env.MQTT_RECONNECT_TIMEOUT || 10000;
// Chunk timeout check
var chunkTimeoutCheck = process.env.MQTT_CHUNK_TIMEOUT_CHECK || 10000;
// Chunk timeout
var chunkTimeout = process.env.MQTT_CHUNK_TIMEOUT || 20000;
// chunk data holder
var chunks = {};

// Chunk timeout checker
setTimeout(chunkTimeoutChecker, chunkTimeoutCheck);


//
//
// Main
//
//

module.exports = {
    isConnected: isConnected,
    clientConfiguration: clientConfiguration,
    configureMQTTConnection: configureMQTTConnection,
    mqttConnect: mqttConnect,
    mqttDisconnect: mqttDisconnect,
    onSuccess: onSuccess,
    onFailure: onFailure,
    onTopicSubscribed: onTopicSubscribed,
    onConnectionLost: onConnectionLost,
    onMessageDelivered: onMessageDelivered,
    onMessageArrived: onMessageArrived,
    subscribeToTopics: subscribeToTopics,
    publishMessage: publishMessage,
    publishChunkedMessage: publishChunkedMessage,
    reconstructChunkedMessage: reconstructChunkedMessage
};

//
//
// Connection functions
//
//

/**
 * Configure a connection to a MQTT broker hostname, port and context, with a clientId.
 * Optionnaly sets a will message to be used by the broker upon client disconnection.
 * Sets connection options to be used.
 * Use default callbacks.
 *
 * @param hostname
 *      Hostname of the broker to connect to.
 * @param port
 *      Port of the broker to connect to.
 * @param context
 *      Context of the broker url to connect to.
 * @param clientId
 *      Id of the client to be used by this connection.
 * @param willMessage
 *      Will message to be used (may be null).
 * @param connectTimeout
 *      Timeout value for connecting in seconds, may be null (default value 3).
 * @param keepAliveInterval
 *      Keep alive interval for connection in seconds, may be null (default value 10).
 * @param useSSL
 *      Indicate wether the broker connection use SSL or not, may be null (default value false).
 * @param userName
 *      Username for connecting to the broker, may be null.
 * @param password
 *      Password for connecting to the broker, may be null.
 * @param cleanSession
 *      true for non persistent session, false for persistent session, may be null (default value true).
 * @param onConnectionSuccessCallback
 *      On connection success callback. May be null for default callback.
 * @param onConnectionFailureCallback
 *      On connection failure callback. May be null for default callback.
 * @param onConnectionLostCallback
 *      On connection lost callback. May be null for default callback.
 * @param onMessageArrivedCallback
 *      On message arrived callback. May be null for default callback.
 * @param onMessageDeliveredCallback
 *      On message delivered callback. May be null for default callback.
 */
function configureMQTTConnection(hostname, port, context, clientId, willMessage,
        connectTimeout, keepAliveInterval, useSSL, userName, password, cleanSession,
        onConnectionSuccessCallback, onConnectionFailureCallback, onConnectionLostCallback,
        onMessageArrivedCallback, onMessageDeliveredCallback) {
    // On connection success callback
    var onConnectionSuccess = this.onSuccess;
    // On connection success
    if (onConnectionSuccessCallback) {
        onConnectionSuccess = onConnectionSuccessCallback;
    }

    // On connection failure callback
    var onConnectionFailure = this.onFailure;
    // On connection success
    if (onConnectionFailureCallback) {
        onConnectionFailure = onConnectionFailureCallback;
    }

    //Options object for connection
    var connectOptions = {
        timeout: (connectTimeout ? connectTimeout : 3),
        keepAliveInterval: (keepAliveInterval ? keepAliveInterval : 10),
        useSSL: (useSSL || useSSL === 'true'),
        userName: userName,
        password: password,
        cleanSession: (cleanSession || cleanSession === 'true'),
        willMessage: willMessage,
        onSuccess: onConnectionSuccess,
        onFailure: onConnectionFailure,
    };

    clientConfiguration.connectOptions = connectOptions;
    // Copy connectOptions by copy : https://bugs.eclipse.org/bugs/show_bug.cgi?id=476039
//    clientConfiguration.connectOptions = clone(connectOptions);

    // Store client configuration
    clientConfiguration.hostname = hostname;
    clientConfiguration.port = port;
    clientConfiguration.context = context;
    clientConfiguration.clientId = clientId;
    
    // Set client connection callbacks handlers
    // On connection lost
    if (onConnectionLostCallback) {
        clientConfiguration.onConnectionLostCallback = onConnectionLostCallback;
    } else {
        clientConfiguration.onConnectionLostCallback = this.onConnectionLost;
    }

    // On message arrived
    if (onMessageArrivedCallback) {
        clientConfiguration.onMessageArrivedCallback = onMessageArrivedCallback;
    } else {
        clientConfiguration.onMessageArrivedCallback = this.onMessageArrived;
    }

    // On message delivered
    if (onMessageDeliveredCallback) {
        clientConfiguration.onMessageDeliveredCallback = onMessageDeliveredCallback;
    } else {
        clientConfiguration.onMessageDeliveredCallback = this.onMessageDelivered;
    }
}


/**
 * Connect to a MQTT broker based on client configuration options
 * setted up with configureMQTTConnection().
 */
function mqttConnect() {
    // Create client object
    client = new Paho.MQTT.Client(clientConfiguration.hostname, clientConfiguration.port, clientConfiguration.context, clientConfiguration.clientId);

    // Sets client callbacks
    client.onConnectionLost = clientConfiguration.onConnectionLostCallback;
    client.onMessageArrived = clientConfiguration.onMessageArrivedCallback;
    client.onMessageDelivered = clientConfiguration.onMessageDeliveredCallback;

    // connect the client
    client.connect(clientConfiguration.connectOptions);
}

function mqttDisconnect() {
    if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
    }

    if (client && connected) {
        client.disconnect();
        console.log('Disconnected !');
        connected = false;
        autoReconnect = false;
    }
}

//
//
// Default callback functions
//
//

/**
 * Called on broker connection successfull.
 */
function onSuccess() {
    // Connection succeeded
    connected = true;
    console.log('Connected!');
    // Remove improper connectOptions from clientConfiguration : https://bugs.eclipse.org/bugs/show_bug.cgi?id=476039
    delete clientConfiguration.connectOptions['mqttVersion'];
    delete clientConfiguration.connectOptions['mqttVersionExplicit'];
//    clientConfiguration.connectOptions = clone(connectOptions);
    reconnectTimeoutId = null;
    autoReconnect = true;
}

/**
 * Called on connection failure. Sets the reconnect timeout
 *
 * @param message
 *		The error message.
 */
function onFailure(message) {
    connected = false;
    console.log("Connection Failed: " + message.errorMessage);
    // Remove improper connectOptions from clientConfiguration : https://bugs.eclipse.org/bugs/show_bug.cgi?id=476039
    delete clientConfiguration.connectOptions['mqttVersion'];
    delete clientConfiguration.connectOptions['mqttVersionExplicit'];
    if (!reconnectTimeoutId && autoReconnect) {
        // Reconnect
        reconnectTimeoutId = setTimeout(mqttConnect, reconnectTimeout);
    }
}

/**
 * Called on topic subscription.
 *
 * @param topic
 * 		the topic subscribed.
 * @param qos
 *		the qos of the topic subscribed.
 */
function onTopicSubscribed(topic, qos) {
    logDebug('Topic ' + topic + ' subscribed with qos ' + qos);
}


/**
 * Called on connection to the broker lost.
 * Use the MQTT_RECONNECT_TIMEOUT for reconection attempt.
 *
 * @param responseObject
 *		Object reprenting connection lost informations.
 */
function onConnectionLost(responseObject) {
    connected = false;
    console.log("Connection Lost" + (responseObject.errorCode !== 0 ? ": " + responseObject.errorMessage : ""));
    // Remove improper connectOptions from clientConfiguration : https://bugs.eclipse.org/bugs/show_bug.cgi?id=476039
    delete clientConfiguration.connectOptions['mqttVersion'];
    delete clientConfiguration.connectOptions['mqttVersionExplicit'];
    if (!reconnectTimeoutId && autoReconnect) {
        // Reconnect
        reconnectTimeoutId = setTimeout(mqttConnect, reconnectTimeout);
    }
}

/**
 * Called on message delivered to the broker.
 *
 * @parma message
 *		The message delivered to the broker.
 */
function onMessageDelivered(message) {
    logDebug('Message Delivered for  ' + message.destinationName + ' : ' + message.payloadString);
}

/**
 * Called on message arrived from the broker.
 *
 * @param message
 *		The message received from the broker.
 *
 * @return JSON parsed javascript object from the message payload.
 */
function onMessageArrived(message) {
    logDebug('Message arrived for  ' + message.destinationName + ' : ' + message.payloadString);

    try {
        var objMessage = JSON.parse(message.payloadString);
        return objMessage;
    } catch (e) {
        console.error("Error parsing JSON for payload " + message.payloadString + " : " + e);
    }
}

//
//
// Utils functions
//
//

/**
 * Return the connection status.
 *
 * @return true if connected, false otherwise
 */
function isConnected() {
    return connected;
}

/**
 * Subscribe to full hierarchy of topic parameter or not
 * depending on tree flag, for a QOS.
 *
 * @param subsribeTopic
 *		Topic hierarchy to subscribe.
 * @param qos
 *		QOS to use for this subscription.
 * @param tree
 * 		If true subscribe to each hierarchy of topic.
 *
 * @return numbers of topics subsribed.
 */
function subscribeToTopics(subscribeTopic, qos, tree) {
    var topics = '';
    if (tree === true) {
        var split = subscribeTopic.split('/');
        var i;

        for (i = 0; i < split.length; i++) {
            topics = ((topics != '') ? topics + '/' : topics ) + split[i];
            client.subscribe(topics, {qos: qos});
            onTopicSubscribed(topics, qos);
        }

        return i;
    } else {
        client.subscribe(subscribeTopic, {qos: qos});
        onTopicSubscribed(subscribeTopic, qos);
        return 1;
    }
}

/**
 * Publish a message in a topic with specific qos and retained flag,
 * based on payload in parameter.
 *
 * @param topic
 *      Destination topic for the message to be sent to.
 * @param messagePayload
 *      Payload of the maessage to be sent.
 * @aram qos
 *      Quality Of Service leve (0, 1, 2, may be null. Default to 0).
 * @param retained
 *      Wether to retain the message in the topic or not (may be null. Default to false).
 */
function publishMessage(topic, messagePayload, qos, retained) {
    if (connected && client) {
        // Create message from payload
        message = new Paho.MQTT.Message(messagePayload);
        // Prepare message configuration options
        message.destinationName = topic;
        message.qos = (qos ? qos : 0);
        message.retained = (retained ? retained : false);
        // Send the message to the client
        client.send(message);
    } else {
        console.log('Message can\'t be published on ' + topic + ' : Not connected or client object null !');
    }
}

/**
 * Publish a chunked message in a topic with specific qos and retained flag,
 * based on payload in parameter. Chunked are based on packetSize.
 *
 * @param topic
 *      Destination topic for the message to be sent to.
 * @param messagePayload
 *      Payload of the maessage to be sent.
 * @aram qos
 *      Quality Of Service leve (0, 1, 2, may be null. Default to 0).
 * @param retained
 *      Wether to retain the message in the topic or not (may be null. Default to false).
 * @param packetSize
 *      Size of chunked part. 
 */
function publishChunkedMessage(topic, fixedPartMessagePayload, messagePayload, qos, retained, packetSize) {
    var end = packetSize,
    start = 0,
    payloadLength = messagePayload.length,
    resourceId = randomWord(8),
    pos = 0,
    noOfPackets = Math.ceil(payloadLength/packetSize);

 
    while (start <= payloadLength) {
        var chunkedPayload = {"r": resourceId, "p": pos, "si": noOfPackets, "d": messagePayload.substr(start, ((end - start) < payloadLength ? (end - start) : payloadLength))};
        // {"c": getParameterByName(clientParam),
        
        try {
            publishMessage(
                topic,
                JSON.stringify(mergeObjects(JSON.parse(fixedPartMessagePayload), chunkedPayload)),
                qos,
                retained
            );
        } catch (e) {
            console.error("Error chunking message : " + e);
        }

        end += packetSize;
        start += packetSize;
        pos = pos +1;
    }
}

/**
 * Reconstruct a chunked message, chunk by chunk.
 *
 * @param messageChunk
 *      A chunk message.
 *
 * @return string representation of the chunked message
 * assembled if complete, null otherwise.
 */
function reconstructChunkedMessage(messageChunk) {
    //creates a new picture object if receiving a new picture, else adds incoming strings to an existing picture 
    if (chunks[messageChunk.r]==null) {
        logDebug("Image reception begins for client " + messageChunk.c + ", resourceId " + messageChunk.r);
        chunks[messageChunk.r] = {"c": 1, "t": messageChunk.si, "p": {}, "r": messageChunk.r};

        chunks[messageChunk.r].p[messageChunk.p] = messageChunk.d;

    } else {
        chunks[messageChunk.r].p[messageChunk.p] = messageChunk.d;
        chunks[messageChunk.r].c += 1;
        if ((messageChunk.p + 1) == 1 || (messageChunk.p + 1) == (Math.ceil(messageChunk.si/4) * 1) || (messageChunk.p + 1) == (Math.ceil(messageChunk.si/4) * 2) || (messageChunk.p + 1) == (Math.ceil(messageChunk.si/4) * 3) || (messageChunk.p + 1) == messageChunk.si) {
            logDebug('client ' + messageChunk.c + ' receiving chunk ' + (messageChunk.p + 1) + ' / ' + messageChunk.si);
        }
    }

    // Last chunk received time in ms
    chunks[messageChunk.r].l = Date.now();

    if (chunks[messageChunk.r].c == chunks[messageChunk.r].t) {
        logDebug("Reception compelete for client " + messageChunk.c + ", resourceId : " + messageChunk.r);
        var str_data=""; 

        for (var i = 0; i < chunks[messageChunk.r].t; i++) 
        str_data = str_data + chunks[messageChunk.r].p[i];

        // Remove in memory chunk
        chunks[messageChunk.r] = null;
        delete chunks[messageChunk.r];
        return str_data;
    }

    return null;
}


/**
 * Generate a random word of length specified.
 *
 * @param length
 *      Desired length of random word.
 *
 * @return a random word of length characters.
 */
function randomWord(length) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < length; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

/**
 * Merge 2 JS objects and return a new one.
 *
 * @param object1
 *      First object to be merged.
 * @param object2
 *      Second object to be merged.
 *
 * @return a new object result of the merge.
 */
function mergeObjects(object1, object2) {
    var result={};
    
    for(var key in object1) result[key] = object1[key];
    for(var key in object2) result[key] = object2[key];

    return result;
}

/**
 * Check chunks for timeout receiving.
 * If any found, remove it.
 * Set another function timeout.
 *
 */
function chunkTimeoutChecker() {
    for (chunk in chunks) {
        // If count is not equal to total and chunk timeout has been reached
        if ((chunks[chunk].c < chunks[chunk].t) && ((Date.now() - chunks[chunk].l) >= chunkTimeout)) {
            // Remove in memory chunk
            logDebug("Chunk id '" + chunk + "' receiving timeout reached, removing");
            chunks[chunk] = null;
            delete chunks[chunk];
        }
    }

    setTimeout(chunkTimeoutChecker, chunkTimeoutCheck);
}

/**
 * Log message to console if isDebugParam not null in the URL.
 *
 * @param message
 *		Message to log to the console.
 */
function logDebug(message) {
    if (process.env.MQTT_IS_DEBUG) {
        console.log(message);
    }
}

/**
 * Split a string upon sep, for n tokens,
 * put the remaining chars in the last index of resulting array.
 *
 * @param str
 *		String to be splitted.
 * @param sep
 *		Separator character.
 * @param n
 *		Number of tokens to be splitted.
 *
 * @return array of n tokens splitted, last index containing
 * the remaining chars of original str.
 */
function splitN(str, sep, n) {
    var out = [];

    while(n--) out.push(str.slice(sep.lastIndex, sep.exec(str).index));

    out.push(str.slice(sep.lastIndex));
    return out;
}


/**
 * Clone an object by copying its properties
 *
 * @param obj
 *      Object to copy
 */
function clone(obj) {
    if (obj == null ||typeof obj != "object") return obj;
    var copy = obj.constructor();
    for (var attr in obj) {
        if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
    }
    return copy;
}

/**
 * Adds hashCode to String prototype.
 *
 * @return absolute integer value of hashcode of string.
 */
String.prototype.hashCode = function() {
  var hash = 0, i, chr, len;
  if (this.length === 0) return hash;
  for (i = 0, len = this.length; i < len; i++) {
    chr   = this.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

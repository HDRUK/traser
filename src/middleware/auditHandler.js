const {PubSub} = require('@google-cloud/pubsub');
const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
const projectId = process.env.PUBSUB_PROJECT_ID || "";
const topicName = process.env.PUBSUB_TOPIC_NAME || "";
const auditEnabled = process.env.AUDIT_LOG_ENABLED || 0;

const publishMessage = async (actionType, actionName, description = "") => {
    if (auditEnabled == true) {
        const pubSubClient = new PubSub({projectId, keyFilename});
        const messageJson = {
            "action_type": actionType,
            "action_name": actionName,
            "action_service": "traser",
            "description": description 
        };
        const topic = pubSubClient.topic(topicName);
        const messageBuffer = Buffer.from(JSON.stringify(messageJson));
        try {
            const messageId = await topic.publish(messageBuffer);
            console.log(`Message ${messageId} published.`);
        } catch (error) {
            console.error(`Received error while publishing: ${error.message}`);
        }
    }
};

module.exports = publishMessage;

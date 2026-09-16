import { PubSub } from "@google-cloud/pubsub";

const projectId = process.env.PUBSUB_PROJECT_ID ?? "";
const topicName = process.env.PUBSUB_TOPIC_NAME ?? "";
const auditEnabled = process.env.AUDIT_LOG_ENABLED === "1";

/**
 * Fire-and-forget audit event to Google Pub/Sub.
 * No-op when AUDIT_LOG_ENABLED != "1".
 */
export async function publishMessage(
  actionType: string,
  actionName: string,
  description = ""
): Promise<void> {
  if (!auditEnabled) return;
  const client = new PubSub({ projectId });
  const message = {
    action_type: actionType,
    action_name: actionName,
    action_service: "traser",
    description,
    created_at: Date.now() * 1000,
  };
  try {
    const id = await client.topic(topicName).publish(
      Buffer.from(JSON.stringify(message))
    );
    console.log(`Audit message ${id} published.`);
  } catch (err) {
    console.error("Audit publish error:", (err as Error).message);
  }
}

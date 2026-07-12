import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.MEMORY_TABLE ?? "atlas-memory";

let client: DynamoDBClient | undefined;

function getClient(): DynamoDBClient {
  if (client === undefined) {
    client = new DynamoDBClient({});
  }
  return client;
}

/**
 * Cross-session memory: we persist only the id of the user's last OpenAI
 * response. Chaining it via previous_response_id rebuilds the conversation
 * history on OpenAI's side (retained there for up to 30 days).
 *
 * Memory is an enhancement, never a dependency: any storage failure is logged
 * and the skill answers without context instead of breaking.
 */
export async function loadLastResponseId(userId: string): Promise<string | undefined> {
  try {
    const result = await getClient().send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: { id: { S: userId } },
      })
    );
    return result.Item?.lastResponseId?.S;
  } catch (error) {
    logMemoryError("load", error);
    return undefined;
  }
}

export async function saveLastResponseId(userId: string, responseId: string): Promise<void> {
  try {
    await getClient().send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          id: { S: userId },
          lastResponseId: { S: responseId },
          updatedAt: { S: new Date().toISOString() },
        },
      })
    );
  } catch (error) {
    logMemoryError("save", error);
  }
}

export async function forgetConversation(userId: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteItemCommand({
        TableName: TABLE_NAME,
        Key: { id: { S: userId } },
      })
    );
  } catch (error) {
    logMemoryError("forget", error);
  }
}

function logMemoryError(operation: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`🟥 Atlas memory ${operation} failed: ${message}`);
}

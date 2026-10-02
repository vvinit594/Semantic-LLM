import { EMBEDDING_DIMENSIONS } from "@semantic-llm/shared";
import { createLocalEmbeddingService } from "@semantic-llm/embeddings";

const embeddings = createLocalEmbeddingService();
await embeddings.init();
const vector = await embeddings.embed("deployment check");
if (vector.length !== EMBEDDING_DIMENSIONS) {
  throw new Error(`Expected a ${EMBEDDING_DIMENSIONS}-dimension vector, received ${vector.length}`);
}
console.log(`Embedding model cached (${vector.length} dimensions).`);

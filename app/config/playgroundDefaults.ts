import defaultGwdm2 from "../routes/playground-default.json";

export const DEFAULT_JSON = JSON.stringify(defaultGwdm2, null, 2);

export const DEFAULT_TEMPLATE = `/* JSONata template — source object is { input, extra }
   Try: input.summary.title  or  input.summary.keywords ~> $split(";,")
*/
{
  "title": input.summary.title,
  "keywords": input.summary.keywords,
  "publisher": input.summary.publisher.publisherName,
  "spatial": input.coverage.spatial
}`;

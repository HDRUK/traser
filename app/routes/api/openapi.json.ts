import swaggerJsdoc from "swagger-jsdoc";
import { resolve } from "path";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "TRASER API",
      version: "1.0.0",
      description:
        "Metadata TRAnslation SERvice — converts health dataset metadata between schema formats (HDRUK, GWDM, SchemaOrg, CRUK) and validates metadata against those schemas.",
    },
    servers: [{ url: "/", description: "This server" }],
    tags: [
      { name: "translate", description: "Translate metadata between schemas" },
      { name: "validate", description: "Validate metadata against a schema" },
      { name: "find", description: "Discover which schemas match a metadata document" },
      { name: "list", description: "List available schemas, templates, datasets, and translation routes" },
      { name: "get", description: "Retrieve a schema definition, translation map, dataset, or form hydration" },
    ],
    components: {
      schemas: {
        ValidationError: {
          type: "object",
          properties: {
            keyword: { type: "string", example: "enum" },
            instancePath: { type: "string", example: "/summary/contactPoint/0/contactType" },
            message: { type: "string", example: "must be equal to one of the allowed values" },
            params: { type: "object" },
            invalidValue: {},
            suggestion: { type: "string", example: 'Allowed: "primary", "secondary"' },
            allowedValues: { type: "array", items: {} },
          },
        },
        ErrorMessage: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string" },
          },
        },
      },
    },
  },
  apis: [resolve(process.cwd(), "app/routes/api/*.ts")],
};

// Generated once per server start — swagger-jsdoc reads source files from disk.
let cachedSpec: unknown;

export async function loader() {
  cachedSpec ??= swaggerJsdoc(options);
  return Response.json(cachedSpec);
}

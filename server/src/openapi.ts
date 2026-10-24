import { JsonSchema, Schema } from 'effect';
import { loadVendor } from 'hono-openapi';

const COMPONENT_REF = '#/components/schemas/';

function rootKey(schema: JsonSchema.JsonSchema) {
  const ref = schema.$ref;
  return typeof ref === 'string' && ref.startsWith(COMPONENT_REF)
    ? ref.slice(COMPONENT_REF.length)
    : undefined;
}

// hono-openapi's built-in Effect vendor calls Effect 3's `JSONSchema.make`,
// which no longer exists in Effect 4.
loadVendor('effect', {
  toJSONSchema: (schema) => {
    const doc = Schema.toJsonSchemaDocument(schema as unknown as Schema.Top);
    return { ...doc.schema, $defs: doc.definitions };
  },
  toOpenAPISchema: (schema, context) => {
    const doc = Schema.toJsonSchemaDocument(schema as unknown as Schema.Top);
    const openapi = JsonSchema.toMultiDocumentOpenApi3_1({
      dialect: doc.dialect,
      schemas: [doc.schema],
      definitions: doc.definitions,
    });
    // Inline the root definition: hono-openapi only emits the first parameter
    // of a `$ref` param/query schema.
    const { [rootKey(openapi.schemas[0]) ?? '']: root, ...definitions } =
      openapi.definitions;
    context.components.schemas = {
      ...context.components.schemas,
      ...definitions,
    };
    return root ?? openapi.schemas[0];
  },
});

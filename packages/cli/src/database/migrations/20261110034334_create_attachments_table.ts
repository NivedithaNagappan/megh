import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("attachments", (table) => {
      table.id();
      table.string("attachable_type", 64);
      table.integer("attachable_id");
      table.string("name");
      table.string("path", 2048);
      table.string("disk", 32).default("local");
      table.string("mime_type", 128).nullable();
      table.integer("size").default(0);
      table.timestamps();
      table.index("attachable_type");
      table.index("attachable_id");
    });
  },

  async down(schema) {
    await schema.drop("attachments");
  },
});

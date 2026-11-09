import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("inquiries", (table) => {
      table.id();
      table.foreignId("property_id").constrained("properties").cascadeOnDelete();
      table.foreignId("listing_id").constrained("listings").nullOnDelete();
      table.foreignId("agent_id").constrained("agents").nullOnDelete();
      table.string("name");
      table.string("email");
      table.string("phone", 32).nullable();
      table.text("message");
      table.string("status", 32).default("new"); // new | contacted | scheduled | closed
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("inquiries");
  },
});

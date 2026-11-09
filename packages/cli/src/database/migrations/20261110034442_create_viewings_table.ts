import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("viewings", (table) => {
      table.id();
      table.foreignId("property_id").constrained("properties").cascadeOnDelete();
      table.foreignId("inquiry_id").constrained("inquiries").nullOnDelete();
      table.foreignId("agent_id").constrained("agents").nullOnDelete();
      table.timestamp("scheduled_at");
      table.string("status", 32).default("scheduled"); // scheduled | completed | cancelled | no_show
      table.text("feedback").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("viewings");
  },
});

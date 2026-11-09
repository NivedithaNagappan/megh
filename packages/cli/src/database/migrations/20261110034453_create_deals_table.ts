import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("deals", (table) => {
      table.id();
      table.foreignId("account_id").constrained("accounts").nullOnDelete();
      table.foreignId("contact_id").constrained("contacts").nullOnDelete();
      table.foreignId("pipeline_id").constrained("pipelines").onDelete("restrict");
      table.foreignId("pipeline_stage_id").constrained("pipeline_stages").onDelete("restrict");
      table.foreignId("owner_id").constrained("users").nullOnDelete();
      table.string("title");
      table.decimal("amount", 12, 2).default(0);
      table.string("currency", 3).default("USD");
      table.date("expected_close_date").nullable();
      table.string("status", 32).default("open"); // open | won | lost
      table.timestamp("closed_at").nullable();
      table.string("lost_reason", 500).nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("deals");
  },
});

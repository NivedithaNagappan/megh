import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("leads", (table) => {
      table.id();
      table.foreignId("contact_id").constrained("contacts").nullOnDelete();
      table.foreignId("campaign_id").constrained("campaigns").nullOnDelete();
      table.foreignId("owner_id").constrained("users").nullOnDelete();
      table.string("name");
      table.string("email");
      table.string("phone", 32).nullable();
      table.string("company").nullable();
      table.string("source", 64).nullable();
      table.string("status", 32).default("new"); // new | contacted | qualified | converted | lost
      table.integer("score").default(0);
      table.text("notes").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("leads");
  },
});

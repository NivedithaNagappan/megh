import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("activities", (table) => {
      table.id();
      table.foreignId("user_id").constrained("users").nullOnDelete();
      table.foreignId("account_id").constrained("accounts").nullOnDelete();
      table.foreignId("contact_id").constrained("contacts").nullOnDelete();
      table.foreignId("deal_id").constrained("deals").nullOnDelete();
      table.string("type", 32); // call | email | meeting | task | note
      table.string("subject");
      table.text("description").nullable();
      table.timestamp("due_at").nullable();
      table.timestamp("completed_at").nullable();
      table.timestamps();
      table.index("type");
    });
  },

  async down(schema) {
    await schema.drop("activities");
  },
});

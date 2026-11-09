import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("campaigns", (table) => {
      table.id();
      table.foreignId("owner_id").constrained("users").nullOnDelete();
      table.string("name");
      table.string("slug").unique();
      table.string("type", 32); // email | sms | social | ads | content | event
      table.string("status", 32).default("draft"); // draft | scheduled | active | paused | completed
      table.decimal("budget", 12, 2).nullable();
      table.decimal("spent", 12, 2).default(0);
      table.timestamp("starts_at").nullable();
      table.timestamp("ends_at").nullable();
      table.text("description").nullable();
      table.timestamps();
      table.index("type");
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("campaigns");
  },
});

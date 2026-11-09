import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("contacts", (table) => {
      table.id();
      table.string("first_name", 100);
      table.string("last_name", 100);
      table.string("email").unique();
      table.string("phone", 32).nullable();
      table.string("company").nullable();
      table.string("job_title", 128).nullable();
      table.string("source", 64).nullable();
      table.string("country", 100).nullable();
      table.string("status", 32).default("subscribed"); // subscribed | unsubscribed | bounced
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("contacts");
  },
});

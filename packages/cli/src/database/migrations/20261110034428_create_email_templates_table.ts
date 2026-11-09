import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("email_templates", (table) => {
      table.id();
      table.string("name");
      table.string("subject");
      table.text("body");
      table.string("from_name").nullable();
      table.string("from_email").nullable();
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("email_templates");
  },
});

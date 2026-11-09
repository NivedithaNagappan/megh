import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("users", (table) => {
      table.id();
      table.string("name");
      table.string("email").unique();
      table.string("password");
      table.timestamp("email_verified_at").nullable();
      table.string("remember_token", 100).nullable();
      table.boolean("is_active").default(true);
      table.timestamp("last_login_at").nullable();
      table.timestamps();
      table.softDeletes();
    });
  },

  async down(schema) {
    await schema.drop("users");
  },
});

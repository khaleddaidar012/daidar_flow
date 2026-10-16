const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const file = path.join(process.env.APPDATA, "Daidar Flow Pilot", "flow.sqlite");
if (!fs.existsSync(file)) {
  console.log(JSON.stringify({ count: 0 }));
} else {
  const db = new DatabaseSync(file, { readOnly: true });
  console.log(
    JSON.stringify({
      count: db
        .prepare(
          "SELECT COUNT(*) n FROM audit WHERE action='application-ready'",
        )
        .get().n,
      schema: db.prepare("PRAGMA user_version").get().user_version,
    }),
  );
  db.close();
}

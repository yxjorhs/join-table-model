# join-table-model
perform join table query like reading an array



## usage

insert some data

```	sql
CREATE TABLE IF NOT EXISTS `user` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'id',
  `nickname` VARCHAR(32) NOT NULL COMMENT 'nickname'
) ENGINE=InnoDB CHARSET=utf8mb4 COMMENT='user';

CREATE TABLE IF NOT EXISTS `phone` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'id',
  `user_id` INT UNSIGNED NOT NULL COMMENT 'user_id',
  `phone` VARCHAR(16) NOT NULL COMMENT 'phone'
) ENGINE=InnoDB CHARSET=utf8mb4 COMMENT='phone';

INSERT INTO `user` VALUES (1, "yxjorhs");
INSERT INTO `phone` VALUES (1, 1, "15911111111");
```



example

```typescript
import mysql from "mysql2";
import JoinTableModel from "join-table-model"

type Model = {
    id: number,
    nickname: string,
    user_phone: string
}

const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    database: "test",
    password: '123456'
})

const jtm = new JoinTableModel<Model>({
    table: 'user', // primary table name
    join: [ // register the join table rule and the field needed
        {
            path: [['phone', 'id', 'user_id']], // left join phone on user.id = phone.user_id
            select: { user_phone: 'phone' } // select phone.phone as user_phone
        }
    ],
    execute: async sql => {
        return util.promisify(connection.execute).call(connection, { sql })
    }
})

async function main() {
    const data = await jtm.map(v => v, {
      where: { id: 1 }
    })
    console.log(data) // [{ id:1, nickname: "yxjorhs", user_phone: "15911111111" }]

    const data2 = await jtm.map(v => v, {
      where: { id: 1 },
      select: ["id"] // the sql would not left join phone table when no need user_phone
    })
    console.log(data2) // [{ id:1 }]
}

```


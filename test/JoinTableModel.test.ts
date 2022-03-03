import assert from "assert"
import fs from "fs"
import util from "util"
import mysql from "mysql2";
import JoinTableModel from "../src/index"

describe('joinTableModel', () => {
  let sql: string = "";

  const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    database: "test",
    password: '123456'
  })

  type Model = {
    id: number,
    nickname: string,
    user_phone: string
  }

  const jtm = new JoinTableModel<Model>({
    table: 'user',
    join: [
      {
        path: [['phone', 'id', 'user_id']],
        select: { user_phone: 'phone' }
      }
    ],
    execute: async s => {
      sql = s
      return util.promisify(connection.execute).call(connection, { sql })
    }
  })

  before(async () => {
    const sqlArr = fs.readFileSync(__dirname + '/JoinTableModel.test.sql')
      .toString()
      .split(';')
      .map(v => v.trim())
      .filter(v => v!== '')
    for (const sql of sqlArr) {
      await util.promisify(connection.query).call(connection, { sql })
    }
  })

  after(async () => {
    connection.destroy()
  })

  it('default', async () => {
    const res = await jtm.map(v => v)

    assert(sql === `select \`user\`.*, \`phone\`.\`phone\` as \`user_phone\` from \`user\` left join \`phone\` as \`phone\` on \`user\`.\`id\` = \`phone\`.\`user_id\` limit 1000`)

    assert(res.length === 1)
    assert(res[0].id === 1)
    assert(res[0].nickname === "yxjorhs")
    assert(res[0].user_phone === "15911111111")
  })

  it('where', async () => {
    const res = await jtm.map(v => v, {
      where: { id: 1 }
    })

    assert(sql === `select \`user\`.*, \`phone\`.\`phone\` as \`user_phone\` from \`user\` left join \`phone\` as \`phone\` on \`user\`.\`id\` = \`phone\`.\`user_id\` where \`user\`.\`id\` = 1 limit 1000`)

    assert(res.length === 1)
    assert(res[0].id === 1)
    assert(res[0].nickname === "yxjorhs")
    assert(res[0].user_phone === "15911111111")

    // or
    await jtm.map(v => v, {
      where: [{ id: 1 }, { id: 2 }]
    })

    assert(<string>sql === `select \`user\`.*, \`phone\`.\`phone\` as \`user_phone\` from \`user\` left join \`phone\` as \`phone\` on \`user\`.\`id\` = \`phone\`.\`user_id\` where (\`user\`.\`id\` = 1) or (\`user\`.\`id\` = 2) limit 1000`)
  })

  it("select", async () => {
    const res = await jtm.map(v => v, {
      select: ['id']
    })

    assert(sql === `select \`user\`.\`id\` as \`id\` from \`user\` limit 1000`)

    assert(res.length === 1)
    assert(res[0].id === 1)
  })

  it("order by", async () => {
    const res = await jtm.map(v => v, {
      orderBy: [['id', 'asc']]
    })

    assert(sql === `select \`user\`.*, \`phone\`.\`phone\` as \`user_phone\` from \`user\` left join \`phone\` as \`phone\` on \`user\`.\`id\` = \`phone\`.\`user_id\` order by \`user\`.\`id\` asc limit 1000`)

    assert(res.length === 1)
    assert(res[0].id === 1)
  })
})
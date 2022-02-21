import assert from 'assert';
import Knex from 'knex';

type dataType = number | string | Date | boolean;

type Condition =
  | dataType
  | Partial<
      | Record<'$eq' | '$gt' | '$gte' | '$lt' | '$lte' | '$ne', dataType>
      | Record<'$null' | '$notNull', true>
      | Record<'$in' | '$notIn', dataType[]>
      | Record<'$like', string>
      | Record<'$between', [dataType, dataType]>
    >;

const conditionOperation: Record<
  string,
  (sqlBuilder: Knex.QueryBuilder, key: string, val: any) => void
> = {
  $eq: (q, k, v) => q.where(k, '=', v),
  $gt: (q, k, v) => q.where(k, '>', v),
  $gte: (q, k, v) => q.where(k, '>=', v),
  $lt: (q, k, v) => q.where(k, '<', v),
  $lte: (q, k, v) => q.where(k, '<=', v),
  $ne: (q, k, v) => q.where(k, '!=', v),
  $null: (q, k) => q.whereNull(k),
  $notNUll: (q, k) => q.whereNotNull(k),
  $in: (q, k, v) => q.whereIn(k, v),
  $notIn: (q, k, v) => q.whereNotIn(k, v),
  $like: (q, k, v) => q.where(k, 'LIKE', v),
  $between: (q, k, v) => q.whereBetween(k, v),
};

export type Where<
  T extends Record<string, any> = Record<string, any>
> = {
  [_K in keyof Partial<T>]: Condition;
};

/**
 * parse {where} to {sqlBuilder}.
 * @param {QueryBuilder} sqlBuilder
 * @param {Object} where
 */
export function parse(
    sqlBuilder: Knex.QueryBuilder,
    where: Where | Where[],
) {
  if (!Array.isArray(where)) {
    parseWhere(sqlBuilder, where);
    return;
  }

  if (where.length === 0) {
    return;
  }

  if (where.length === 1) {
    parseWhere(sqlBuilder, where[0]);
    return;
  }

  where.forEach((w) => {
    sqlBuilder.orWhere(function(sqlBuilder) {
      parseWhere(sqlBuilder, w);
    });
  });
}

/**
 * parse {where} to {sqlBuilder}
 * @param {Object} sqlBuilder
 * @param {Object} where
 */
function parseWhere(
    sqlBuilder: Knex.QueryBuilder,
    where: Record<any, Condition>,
) {
  Object.entries(where)
      .forEach((v) => parseCondition(sqlBuilder, v[0], v[1]));
}

/**
 * parse steps - parse condition
 * @param {Object} sqlBuilder
 * @param {string} key
 * @param {Object} condition
 */
function parseCondition(
    sqlBuilder: Knex.QueryBuilder,
    key: string,
    condition: Condition,
) {
  if (
    condition instanceof Object === false ||
    condition instanceof Date
  ) {
    sqlBuilder.where({[key]: condition});
    return;
  }

  Object.entries(condition).forEach((c) => {
    const fn = conditionOperation[c[0]];

    assert(
        fn !== undefined,
        `condition ${c[0]} invalid`,
    );

    fn(sqlBuilder, key, c[1]);
  });
}

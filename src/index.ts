import assert from 'assert';
import knex from 'knex';
import Where from './Where';

/**
 * build a model on multiple table, and use it like array,
 * for example: find, forEach, map...you could set option.where
 * or option.limit to reduce scan rows for database.
 */
class JoinTableModel<
  TRecord extends Record<string | number | symbol, any>
> {
  private _option: Required<JoinTableModel.Option<keyof TRecord>>

  private _joinFieldInfo = new Map<
    keyof TRecord,
    { field: string, path: [string, string, string][]}
  >()

  /**
   * @param {Option} option
   */
  constructor(option: JoinTableModel.Option<keyof TRecord>) {
    this._option = {
      table: option.table,
      execute: option.execute,
      join: option.join || [],
    };

    this._option.join.forEach((j) => {
      (<[keyof TRecord, string][]>Object.entries(j.select))
          .forEach(([fieldAlias, field]) => {
            this._joinFieldInfo.set(fieldAlias, {
              field,
              path: j.path,
            });
          });
    });
  }

  /**
   * count the record
   * - {option.limit} allow count stop while developer need.
   * @param {CountOption} option
   */
  public async count(
      option: JoinTableModel.CountOption<TRecord>,
  ): Promise<number> {
    return this._search('count', option);
  }

  /**
   * find a record
   * @param {function} predicate
   * @param {SearchOption} option
   */
  public async find<S extends keyof TRecord>(
      predicate: (record: Pick<TRecord, S>) => boolean | Promise<boolean>,
      option?: JoinTableModel.SearchOption<TRecord, S>,
  ) {
    const offset = 0;
    let limit = 1;
    let ret: Pick<TRecord, S> | undefined = undefined;

    // often only on record needs to be queried
    // gradually increase {limit} when needed
    while (true) {
      const list = await this.map((v) => v, {
        ...option,
        offset,
        limit,
      });
      ret = list.find(predicate);
      if (ret !== undefined) break;
      if (limit < N.FIND_LIMIT_MAX) limit *= 2;
    }

    return ret;
  }

  /**
   * forEach
   * @param {function} cb
   * @param {Object} option
   */
  public async forEach<S extends keyof TRecord>(
      cb: (v: Pick<TRecord, S>, index: number) => void,
      option?: JoinTableModel.SearchOption<TRecord, S>,
  ) {
    option = option || {};
    let offset = option.offset || 0;
    const limit = Math.min(1000, option.limit || Infinity);
    const start = offset;
    const stop = option.limit !== undefined ? offset + option.limit : Infinity;

    while (offset < stop) {
      const list: Pick<TRecord, S>[] = await this._search('record', {
        ...option,
        offset,
        limit,
      });
      list.forEach((v) => cb(v, offset - start));
      offset += list.length;
      if (list.length < limit) break;
    }
  }

  /**
   * map
   * @param {function} cb
   * @param {Object} option
   * @return {Array}
   */
  public async map<S extends keyof TRecord, T>(
      cb: (v: Pick<TRecord, S>, index: number) => T,
      option?: JoinTableModel.SearchOption<TRecord, S>,
  ): Promise<T[]> {
    const ret: T[] = [];

    await this.forEach((v, i) => ret.push(cb(v, i)), option);

    return ret;
  }

  /**
   * search database
   * @param {string} scene
   * @param {Object} option
   * @return {any}
   */
  private async _search<S extends keyof TRecord>(
      scene: 'count' | 'record',
      option?: JoinTableModel.SearchOption<TRecord, S>,
  ) {
    assert(scene === 'count' || scene === 'record', 'scene invalid');

    const opt = this._searchOptionCheck(scene, option);

    const builder = knex({client: 'mysql2'})
        .queryBuilder()
        .table(`${this._option.table}`);

    const leftJoinRet = this._searchLeftJoin(builder, opt);
    this._searchWhere(builder, leftJoinRet.fieldTableMap, opt);

    return scene === 'record' ?
      this._searchRecord(builder, leftJoinRet.fieldTableMap, opt) :
      this._searchCount(builder);
  }

  /**
   * return option
   */
  public get option() {
    return this._option;
  }

  /**
   * assert search option valid
   * @param {string} scene
   * @param {Object} option
   * @return {Object}
   */
  private _searchOptionCheck<
    S extends keyof TRecord,
  >(
      scene: 'count' | 'record',
      option?: JoinTableModel.SearchOption<TRecord, S>,
  ) {
    const opt = <
      Required<JoinTableModel.SearchOption<TRecord, S>>
    >(option || {});

    assert(typeof opt === 'object', 'option invalid');

    opt.select = opt.select || [];
    opt.where = opt.where || {};
    opt.offset = opt.offset || 0;
    opt.limit = opt.limit || 1000;
    opt.orderBy = opt.orderBy || [];

    if (scene === 'count') {
      opt.select = [];
      opt.orderBy = [];
    } else {
      if (opt.select.length === 0) {
        // return all field default
        opt.select.push(`${this._option.table}.*` as S);
        this._joinFieldInfo.forEach((_, fieldAlias) => {
          opt.select.push(fieldAlias as S);
        });
      }
    }

    return opt;
  }

  /**
   * search steps - left join
   * @param {Object} builder
   * @param {Object} opt
   * @return {Object}
   */
  private _searchLeftJoin(
      builder: knex.QueryBuilder,
      opt: Required<JoinTableModel.SearchOption<TRecord, any>>,
  ) {
    /*
    1.avoid repeat left join.
    2.if left join to a table throught different path,
      table need different alias.
    3.map field alias and table alias.
    */

    /** map<table name, alias count> */
    const tableAliasCount = new Map<string, number>();
    tableAliasCount.set(this._option.table, 1);

    /**
     * map<join path, table alias>
     */
    const join = new Map<string, string>();

    /**
     * map<field alias, table alias>
     */
    const fieldTableMap = new Map<keyof TRecord, string>();

    this._option.join.forEach((j) => {
      const fieldAlias = Object.keys(j.select) as (keyof TRecord)[];

      const needJoin = fieldAlias.some((alias) => {
        return (opt.where as any)[alias] !== undefined ||
          opt.select.some((k) => k === alias) ||
          opt.orderBy.some((v) => v[0] === alias);
      });

      if (!needJoin) return;

      let ltableAlias = this._option.table;

      j.path.forEach(([rtable, lfield, rfield]) => {
        const joinKey = `${ltableAlias}.${lfield}->${rtable}.${rfield}`;

        let rtableAlias = join.get(joinKey);

        if (rtableAlias === undefined) {
          const tac = tableAliasCount.get(rtable);

          tableAliasCount.set(rtable, (tac || 0) + 1);

          rtableAlias = rtable + (tac && tac > 0 ? tac + 1 : '');

          builder.leftJoin(
              `${rtable} as ${rtableAlias}`,
              `${ltableAlias}.${lfield}`,
              `${rtableAlias}.${rfield}`,
          );

          join.set(joinKey, rtableAlias);
        }

        ltableAlias = rtableAlias;
      });

      fieldAlias.forEach((alias) => {
        fieldTableMap.set(alias, ltableAlias);
      });
    });

    return {
      fieldTableMap,
    };
  }

  /**
   * parse {fieldAlias} to {tableAlias.field}
   * @param {string} fieldAlias
   * @param {Map} fieldTableMap
   * @return {void}
   */
  private _fieldParse(
      fieldAlias: keyof TRecord,
      fieldTableMap: Map<keyof TRecord, string>,
  ) {
    if ((fieldAlias as string).indexOf('.') !== -1) { // table.*
      return fieldAlias;
    }

    const tableAlias = fieldTableMap.get(fieldAlias) || this._option.table;
    const fieldInfo = this._joinFieldInfo.get(fieldAlias);
    const field = fieldInfo ? fieldInfo.field : fieldAlias;

    return `${tableAlias}.${field}`;
  }

  /**
   * search steps - parse where
   * @param {Object} builder
   * @param {Map} fieldTableMap
   * @param {Object} opt
   */
  private _searchWhere(
      builder: knex.QueryBuilder,
      fieldTableMap: Map<keyof TRecord, string>,
      opt: Required<JoinTableModel.SearchOption<TRecord, any>>,
  ) {
    const fieldParseWhere: any = {};
    Object.entries(opt.where).forEach(
        ([field, condition]) => {
          (fieldParseWhere[this._fieldParse(field, fieldTableMap)] = condition);
        },
    );
    Where.parseToSqlBuilder(builder, fieldParseWhere);
  }

  /**
   * search steps - execute count query
   * @param {Object} builder
   * @return {number}
   */
  private async _searchCount(builder: knex.QueryBuilder) {
    const qr = builder.count(`${this._option.table}.id as count`).toQuery();
    const [{count}] = await this._option.execute(qr);
    return count;
  }

  /**
   * search steps - execute query
   * @param {Object} builder
   * @param {Map} fieldTableMap
   * @param {Object} opt
   * @return {any}
   */
  private async _searchRecord(
      builder: knex.QueryBuilder,
      fieldTableMap: Map<keyof TRecord, string>,
      opt: Required<JoinTableModel.SearchOption<TRecord, any>>,
  ) {
    opt.orderBy.forEach(([field, forward]) => {
      builder.orderBy(this._fieldParse(field, fieldTableMap), forward);
    });

    const qr = builder
        .select(opt.select.map((field) => {
          if (field.indexOf('*') !== -1) return field;
          return `${this._fieldParse(field, fieldTableMap)} as ${field}`;
        }))
        .offset(opt.offset)
        .limit(opt.limit)
        .toQuery();

    return this._option.execute(qr);
  }
}

namespace JoinTableModel {
  export type Join<K extends string | number | symbol> = {
    /** [right table, left field, right field][] */
    path: [string, string, string][];
    /** Record<fieldAlias, field> */
    select: Partial<Record<K, string>>;
  };

  export type Option<K extends string | number | symbol> = {
    table: string;
    execute: (sql: string) => Promise<any>;
    join?: Join<K>[];
  };

  export type OrderBy<
    T extends Record<string, any>
  > = [keyof T, 'asc' | 'desc'][]

  export type SearchOption<
    T extends Record<string, any>,
    Select extends keyof T
  > = Partial<{
    offset: number;
    limit: number;
    select: Select[];
    where: Where.IWhere<T>;
    orderBy: OrderBy<T>;
  }>

  export type CountOption<
    T extends Record<string, any>
  > = Pick<SearchOption<T, any>, 'where' | 'limit'>;
}

namespace N {
  export const FIND_LIMIT_MAX = Math.pow(2, 10);
}

export default JoinTableModel;

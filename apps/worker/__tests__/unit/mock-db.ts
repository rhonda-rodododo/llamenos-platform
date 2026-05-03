import { jest } from 'bun:test'
function makeChainable<T>(result: T, methods: Record<string, any>) {
  const p = Promise.resolve(result) as Promise<T> & Record<string, any>
  for (const [key, val] of Object.entries(methods)) {
    p[key] = val
  }
  return p
}

export function createMockDb(tables: string[] = []) {
  const store: Record<string, any[]> = {}
  for (const t of tables) store[t] = []

  let _selectResults: any[][] = []
  let _selectIndex = 0
  let _insertResult: any[] = []
  let _updateResult: any[] = []
  let _deleteResult: any[] = []
  let _executeResult: any = null

  function nextSelect() {
    const result = _selectResults[_selectIndex] ?? []
    _selectIndex++
    return result
  }

  const reset = () => {
    for (const t of tables) store[t] = []
    _selectResults = []
    _selectIndex = 0
    _insertResult = []
    _updateResult = []
    _deleteResult = []
    _executeResult = null
  }

  function buildSelectChain(result: any[]) {
    const limitFn = jest.fn((n?: number) =>
      makeChainable(result.slice(0, n ?? result.length), {
        offset: jest.fn(() => Promise.resolve(result)),
      })
    )

    const orderByFn = jest.fn(() =>
      makeChainable(result, {
        limit: limitFn,
        offset: jest.fn(() => Promise.resolve(result)),
      })
    )

    const groupByFn = jest.fn(() =>
      makeChainable(result, {
        orderBy: jest.fn(() => Promise.resolve(result)),
      })
    )

    const offsetFn = jest.fn(() => Promise.resolve(result))

    return makeChainable(result, {
      limit: limitFn,
      orderBy: orderByFn,
      offset: offsetFn,
      groupBy: groupByFn,
    })
  }

  const db = {
    $store: store,
    $setSelectResult: (rows: any[]) => { _selectResults = [rows]; _selectIndex = 0 },
    $setSelectResults: (results: any[][]) => { _selectResults = results; _selectIndex = 0 },
    $setInsertResult: (rows: any[]) => { _insertResult = rows },
    $setUpdateResult: (rows: any[]) => { _updateResult = rows },
    $setDeleteResult: (rows: any[]) => { _deleteResult = rows },
    $setExecuteResult: (result: any) => { _executeResult = result },
    $reset: reset,

    select: jest.fn(() => {
      const result = nextSelect()
      return {
        from: jest.fn(() => {
          const whereFn = jest.fn(() => buildSelectChain(result))
          const limitFn = jest.fn((n?: number) =>
            makeChainable(result.slice(0, n ?? result.length), {
              offset: jest.fn(() => Promise.resolve(result)),
            })
          )
          const orderByFn = jest.fn(() =>
            makeChainable(result, {
              limit: limitFn,
              offset: jest.fn(() => Promise.resolve(result)),
            })
          )
          const groupByFn = jest.fn(() =>
            makeChainable(result, {
              orderBy: jest.fn(() => Promise.resolve(result)),
            })
          )

          return makeChainable(result, {
            where: whereFn,
            limit: limitFn,
            orderBy: orderByFn,
            groupBy: groupByFn,
          })
        }),
      }
    }),

    insert: jest.fn(() => ({
      values: jest.fn(() => {
        const returningFn = jest.fn(() => Promise.resolve(_insertResult))
        const onConflictDoUpdateFn = jest.fn(() =>
          makeChainable(_insertResult, {
            returning: returningFn,
          })
        )
        const onConflictDoNothingFn = jest.fn(() => Promise.resolve())

        return makeChainable(_insertResult, {
          returning: returningFn,
          onConflictDoUpdate: onConflictDoUpdateFn,
          onConflictDoNothing: onConflictDoNothingFn,
        })
      }),
    })),

    update: jest.fn(() => ({
      set: jest.fn(() => {
        const whereFn = jest.fn(() =>
          makeChainable(_updateResult, {
            returning: jest.fn(() => Promise.resolve(_updateResult)),
          })
        )
        return { where: whereFn }
      }),
    })),

    delete: jest.fn(() => ({
      where: jest.fn(() =>
        makeChainable(_deleteResult, {
          returning: jest.fn(() => Promise.resolve(_deleteResult)),
        })
      ),
    })),

    execute: jest.fn(() => Promise.resolve(_executeResult)),
  }

  return { db, store, reset }
}

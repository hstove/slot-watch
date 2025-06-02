import { type Atom, atom, type Getter, type Setter } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { dequal } from 'dequal/lite';
import * as R from 'remeda';

export function setDebugLabel(
  atom: Atom<unknown>,
  label: string | undefined,
  name: string,
  key?: unknown,
) {
  if (import.meta.env.PROD || !label) return;
  let debugLabel = `${label}-${name}`;
  if (key) {
    debugLabel = `${debugLabel}-${JSON.stringify(key)}`;
  }
  atom.debugLabel = debugLabel;
}

type SetAtom<Args extends unknown[], Result> = <A extends Args>(
  ...args: A
) => Result;

type Read<Value, SetSelf = never> = (
  get: Getter,
  options?: {
    readonly signal: AbortSignal;
    readonly setSelf: SetSelf;
  },
) => Value;

export function listAtomWithInit<T, K>(
  // initFn: (get: Getter) => Promise<T[]>,
  initFn: Read<Promise<T[]>, SetAtom<[T[] | T], void>>,
  keyFn: (item: T) => K,
  onItemSet?: (get: Getter, set: Setter, item: T) => void,
  debugLabel?: string,
) {
  const initAtom = atom<Promise<T[]>, [T[] | T], void>(
    async (get, options) => {
      const data = await initFn(get, options);
      options.setSelf(data);
      return data;
    },
    (_get, set, listOrItem: T[] | T) => {
      set(writerAtom, listOrItem);
    },
  );
  setDebugLabel(initAtom, debugLabel, 'init');
  const writerAtom = atom(null, (get, set, listOrItem: T[] | T) => {
    if (R.isArray(listOrItem)) {
      set(listAtomInner, listOrItem);
      for (const item of listOrItem) {
        set(itemAtomFamilyInner(keyFn(item)), item);
        onItemSet?.(get, set, item);
      }
      // console.log('Set list', listOrItem.length);
    } else {
      const key = keyFn(listOrItem);
      set(itemAtomFamilyInner(key), listOrItem);
      const existingList = get(listAtomInner);
      const existingIndex = existingList.findIndex((item) =>
        dequal(keyFn(item), key),
      );
      if (existingIndex === -1) {
        set(listAtomInner, (list) => {
          return [listOrItem, ...list];
        });
        // if (R.isPlainObject(key)) {
        // console.log('Added new to list', key);
        // }
      } else {
        existingList[existingIndex] = listOrItem;
        // console.log(
        //   'Updated existing in list',
        //   key,
        //   existingIndex,
        //   existingList.length,
        // );
        set(listAtomInner, [...existingList]);
      }

      onItemSet?.(get, set, listOrItem);
    }
  });
  setDebugLabel(writerAtom, debugLabel, 'writer');
  const listAtomInner = atom<T[]>([]);
  setDebugLabel(listAtomInner, debugLabel, 'list-inner');
  const itemAtomFamilyInner = atomFamily((_params: K) => atom<T>(), dequal);
  const itemAtomFamily = atomFamily((params: K) => {
    const a = atom<T>((get) => {
      const inner = get(itemAtomFamilyInner(params));
      if (typeof inner === 'undefined') {
        throw new Error('Item not found');
      }
      return inner;
    });
    setDebugLabel(a, debugLabel, 'item', params);
    return a;
  }, dequal);
  const listAtom = atom(async (get) => {
    // prefetch
    await get(initAtom);
    return get(listAtomInner);
  });
  setDebugLabel(listAtom, debugLabel, 'list');
  return [
    listAtom,
    itemAtomFamily,
    itemAtomFamilyInner,
    listAtomInner,
    writerAtom,
  ] as const;
}

type ReadOuter<Value, OKey, SetSelf = never> = (
  outerKey: OKey,
  get: Getter,
  options?: {
    readonly signal: AbortSignal;
    readonly setSelf: SetSelf;
  },
) => Value;

export function listAtomFamilyWithInit<OKey, T, K>(
  initFn: ReadOuter<Promise<T[]>, OKey, SetAtom<[OKey, T[] | T], void>>,
  keyFn: (item: T) => K,
  onItemSet?: (get: Getter, set: Setter, item: T) => void,
  debugLabel?: string,
) {
  const initAtom = atomFamily((outerKey: OKey) => {
    const a = atom<Promise<T[]>, [OKey, T[] | T], void>(
      async (get, options) => {
        // console.log('Initial fetch', outerKey);
        const data = await initFn(outerKey, get, options);
        options.setSelf(outerKey, data);
        return data;
      },
      (_get, set, outerKey: OKey, listOrItem: T[] | T) => {
        set(writerAtom(outerKey), outerKey, listOrItem);
      },
    );
    setDebugLabel(a, debugLabel, 'init', outerKey);
    return a;
  }, dequal);
  const writerAtom = atomFamily((_outerKey: OKey) => {
    const a = atom(null, (get, set, outerKey: OKey, listOrItem: T[] | T) => {
      if (Array.isArray(listOrItem)) {
        set(listAtomFamilyInner(outerKey), (existingList) => {
          if (existingList.length === 0) {
            return listOrItem;
          }
          for (const item of existingList) {
            const existingIndex = existingList.findIndex((item) =>
              dequal(keyFn(item), keyFn(item)),
            );
            if (existingIndex === -1) {
              existingList.push(item);
            } else {
              existingList[existingIndex] = item;
            }
          }
          return [...existingList];
        });
        for (const item of listOrItem) {
          set(itemAtomFamilyInner(keyFn(item)), item);
          onItemSet?.(get, set, item);
        }
      } else {
        const key = keyFn(listOrItem);
        set(itemAtomFamilyInner(key), listOrItem);
        const existingList = get(listAtomFamilyInner(outerKey));
        const existingIndex = existingList.findIndex((item) =>
          dequal(keyFn(item), key),
        );
        if (existingIndex === -1) {
          set(listAtomFamilyInner(outerKey), (list) => {
            return [listOrItem, ...list];
          });
        } else {
          existingList[existingIndex] = listOrItem;
          set(listAtomFamilyInner(outerKey), [...existingList]);
          // console.log('Updated existing', keyFn(listOrItem), outerKey);
        }

        onItemSet?.(get, set, listOrItem);
      }
    });
    setDebugLabel(a, debugLabel, 'writer', _outerKey);
    return a;
  }, dequal);
  const listAtomFamilyInner = atomFamily((_outerKey: OKey) => {
    const a = atom<T[]>([]);
    setDebugLabel(a, debugLabel, 'list-inner', _outerKey);
    return a;
  }, dequal);
  const itemAtomFamilyInner = atomFamily((params: K) => {
    const a = atom<T>();
    setDebugLabel(a, debugLabel, 'item-inner', params);
    return a;
  }, dequal);
  const itemAtomFamily = atomFamily((params: K) => {
    const a = atom<T>((get) => {
      const inner = get(itemAtomFamilyInner(params));
      if (typeof inner === 'undefined') {
        throw new Error('Item not found');
      }
      return inner;
    });
    setDebugLabel(a, debugLabel, 'item', params);
    return a;
  }, dequal);
  const listAtom = atomFamily((outerKey: OKey) => {
    const listAtom = atom(async (get) => {
      await get(initAtom(outerKey));
      return get(listAtomFamilyInner(outerKey));
    });
    setDebugLabel(listAtom, debugLabel, 'list', outerKey);
    return listAtom;
  });
  return [
    listAtom,
    itemAtomFamily,
    itemAtomFamilyInner,
    listAtomFamilyInner,
    writerAtom,
  ] as const;
}

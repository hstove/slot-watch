import { atom, type Getter, type Setter } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { dequal } from 'dequal/lite';
import * as R from 'remeda';

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
) {
  const initAtom = atom<Promise<T[]>, [T[] | T], void>(
    async (get, options) => {
      const data = await initFn(get, options);
      options.setSelf(data);
      return data;
    },
    (_get, set, listOrItem: T[] | T) => {
      set(writerAtom, listOrItem);
      // if (Array.isArray(listOrItem)) {
      //   set(listAtomInner, listOrItem);
      //   for (const item of listOrItem) {
      //     set(itemAtomFamilyInner(keyFn(item)), item);
      //   }
      // } else {
      //   set(itemAtomFamilyInner(keyFn(listOrItem)), listOrItem);
      //   set(listAtomInner, (list) => {
      //     return [listOrItem, ...list];
      //   });
      // }
    },
  );
  const writerAtom = atom(null, (get, set, listOrItem: T[] | T) => {
    if (R.isArray(listOrItem)) {
      set(listAtomInner, listOrItem);
      for (const item of listOrItem) {
        set(itemAtomFamilyInner(keyFn(item)), item);
        onItemSet?.(get, set, item);
      }
      console.log('Set list', listOrItem.length);
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
        console.log('Added new to list', key);
        // }
      } else {
        existingList[existingIndex] = listOrItem;
        console.log('Updated existing in list', key, existingList.length);
        set(listAtomInner, existingList);
      }

      onItemSet?.(get, set, listOrItem);
    }
  });
  const listAtomInner = atom<T[]>([]);
  const itemAtomFamilyInner = atomFamily((_params: K) => atom<T>(), dequal);
  const itemAtomFamily = atomFamily(
    (params: K) =>
      atom<T>((get) => {
        const inner = get(itemAtomFamilyInner(params));
        if (typeof inner === 'undefined') {
          throw new Error('Item not found');
        }
        return inner;
      }),
    dequal,
  );
  const listAtom = atom(async (get) => {
    // prefetch
    await get(initAtom);
    return get(listAtomInner);
  });
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
) {
  const initAtom = atomFamily(
    (outerKey: OKey) =>
      atom<Promise<T[]>, [OKey, T[] | T], void>(
        async (get, options) => {
          console.log('Initial fetch', outerKey);
          const data = await initFn(outerKey, get, options);
          options.setSelf(outerKey, data);
          return data;
        },
        (_get, set, outerKey: OKey, listOrItem: T[] | T) => {
          set(writerAtom(outerKey), outerKey, listOrItem);
        },
      ),
    dequal,
  );
  const writerAtom = atomFamily(
    (_outerKey: OKey) =>
      atom(null, (get, set, outerKey: OKey, listOrItem: T[] | T) => {
        if (Array.isArray(listOrItem)) {
          set(listAtomFamilyInner(outerKey), listOrItem);
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
            if (R.isPlainObject(key)) {
              console.log('Added new', key, outerKey);
            }
          } else {
            existingList[existingIndex] = listOrItem;
            set(listAtomFamilyInner(outerKey), existingList);
            // console.log('Updated existing', keyFn(listOrItem), outerKey);
          }

          onItemSet?.(get, set, listOrItem);
        }
      }),
    dequal,
  );
  const listAtomFamilyInner = atomFamily(
    (_outerKey: OKey) => atom<T[]>([]),
    dequal,
  );
  const itemAtomFamilyInner = atomFamily((_params: K) => atom<T>(), dequal);
  const itemAtomFamily = atomFamily(
    (params: K) =>
      atom<T>((get) => {
        const inner = get(itemAtomFamilyInner(params));
        if (typeof inner === 'undefined') {
          throw new Error('Item not found');
        }
        return inner;
      }),
    dequal,
  );
  const listAtom = atomFamily((outerKey: OKey) => {
    return atom(async (get) => {
      await get(initAtom(outerKey));
      return get(listAtomFamilyInner(outerKey));
    });
  });
  return [
    listAtom,
    itemAtomFamily,
    itemAtomFamilyInner,
    listAtomFamilyInner,
    writerAtom,
  ] as const;
}

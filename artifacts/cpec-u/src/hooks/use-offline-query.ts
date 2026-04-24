import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { getCachedData } from "@/lib/offline";
import { useOffline } from "@/lib/offline/offline-context";

export interface UseOfflineQueryOptions<T> extends Omit<UseQueryOptions<T>, "queryFn"> {
  queryFn: () => Promise<T>;
  cacheKey: string;
  enabled?: boolean;
}

export interface UseOfflineQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  isFromCache: boolean;
  isStale: boolean;
  refetch: () => void;
}

export function useOfflineQuery<T = unknown>(
  options: UseOfflineQueryOptions<T>
): UseOfflineQueryResult<T> {
  const { cacheKey, queryFn, enabled = true, ...rest } = options;
  const { isOnline } = useOffline();
  const [idbData, setIdbData] = useState<T | undefined>(undefined);
  const [isFromCache, setIsFromCache] = useState(false);
  const idbFetched = useRef(false);

  const result = useQuery<T>({
    ...rest,
    queryFn,
    enabled,
    retry: isOnline ? (rest.retry ?? 2) : 0,
    staleTime: isOnline ? (rest.staleTime ?? 0) : Infinity,
  });

  useEffect(() => {
    const shouldFallback =
      !result.data &&
      !result.isLoading &&
      (result.isError || !isOnline);

    if (shouldFallback && !idbFetched.current) {
      idbFetched.current = true;
      getCachedData<T>(cacheKey).then((cached) => {
        if (cached !== null) {
          setIdbData(cached);
          setIsFromCache(true);
        }
      });
    } else if (result.data) {
      idbFetched.current = false;
      setIdbData(undefined);
      setIsFromCache(false);
    }
  }, [result.data, result.isLoading, result.isError, isOnline, cacheKey]);

  useEffect(() => {
    idbFetched.current = false;
  }, [cacheKey]);

  return {
    data: result.data ?? idbData,
    isLoading: result.isLoading && !idbData,
    isError: result.isError && !idbData && !result.data,
    isFromCache,
    isStale: isFromCache,
    refetch: result.refetch,
  };
}

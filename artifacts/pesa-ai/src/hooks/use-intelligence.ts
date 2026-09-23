import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface KnowledgeItem {
  id: string;
  title: string;
  category: string;
  text: string;
  source?: string;
}

export interface ServiceLocation {
  id: string;
  label: string;
  kind: string;
  active: boolean;
  publicToken?: string;
}

const fetcher = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    credentials: "include",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || error.message || "An error occurred");
  }
  const data = await res.json();
  return data.data !== undefined ? data.data : data;
};

export function useGetKnowledge(businessId: string) {
  return useQuery({
    queryKey: ["knowledge", businessId],
    queryFn: () => fetcher(`/api/businesses/${businessId}/knowledge`) as Promise<KnowledgeItem[]>,
    enabled: !!businessId,
  });
}

export function useCreateKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ businessId, data }: { businessId: string; data: Omit<KnowledgeItem, "id"> }) =>
      fetcher(`/api/businesses/${businessId}/knowledge`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { businessId }) => {
      queryClient.invalidateQueries({ queryKey: ["knowledge", businessId] });
    },
  });
}

export function useUpdateKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ businessId, entryId, data }: { businessId: string; entryId: string; data: Partial<Omit<KnowledgeItem, "id">> }) =>
      fetcher(`/api/businesses/${businessId}/knowledge/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { businessId }) => {
      queryClient.invalidateQueries({ queryKey: ["knowledge", businessId] });
    },
  });
}

export function useDeleteKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ businessId, entryId }: { businessId: string; entryId: string }) =>
      fetcher(`/api/businesses/${businessId}/knowledge/${entryId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, { businessId }) => {
      queryClient.invalidateQueries({ queryKey: ["knowledge", businessId] });
    },
  });
}

export function useExtractKnowledge() {
  return useMutation({
    mutationFn: ({ businessId, data }: { businessId: string; data: { fileName: string; mimeType: string; base64: string } }) =>
      fetcher(`/api/businesses/${businessId}/knowledge/extract`, {
        method: "POST",
        body: JSON.stringify(data),
      }) as Promise<{ text: string; fileName: string; warnings?: string[] }>,
  });
}

export function useGetServiceLocations(businessId: string) {
  return useQuery({
    queryKey: ["service-locations", businessId],
    queryFn: () => fetcher(`/api/businesses/${businessId}/service-locations`) as Promise<ServiceLocation[]>,
    enabled: !!businessId,
  });
}

export function useCreateServiceLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ businessId, data }: { businessId: string; data: Omit<ServiceLocation, "id" | "publicToken"> }) =>
      fetcher(`/api/businesses/${businessId}/service-locations`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { businessId }) => {
      queryClient.invalidateQueries({ queryKey: ["service-locations", businessId] });
    },
  });
}

export function useUpdateServiceLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ businessId, locationId, data }: { businessId: string; locationId: string; data: Partial<Omit<ServiceLocation, "id" | "publicToken">> }) =>
      fetcher(`/api/businesses/${businessId}/service-locations/${locationId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { businessId }) => {
      queryClient.invalidateQueries({ queryKey: ["service-locations", businessId] });
    },
  });
}

export function useDeleteServiceLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ businessId, locationId }: { businessId: string; locationId: string }) =>
      fetcher(`/api/businesses/${businessId}/service-locations/${locationId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, { businessId }) => {
      queryClient.invalidateQueries({ queryKey: ["service-locations", businessId] });
    },
  });
}

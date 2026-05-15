import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  getPermissionsCatalog,
} from '@/lib/api'

export const roleKeys = {
  all: ['roles'] as const,
  list: (scope?: 'hub' | 'platform') => [...roleKeys.all, 'list', scope] as const,
  permissions: () => ['permissions-catalog'] as const,
}

export function useRoles(scope?: 'hub' | 'platform') {
  return useQuery({
    queryKey: roleKeys.list(scope),
    queryFn: async () => {
      const { roles } = await listRoles()
      return roles
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function usePermissionsCatalog() {
  return useQuery({
    queryKey: roleKeys.permissions(),
    queryFn: () => getPermissionsCatalog(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.all })
    },
  })
}

export function useUpdateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateRole>[1] }) =>
      updateRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.all })
    },
  })
}

export function useDeleteRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.all })
    },
  })
}

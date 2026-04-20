export const roleLabels = {
  admin: 'Админ',
  chef: 'Шеф',
  employee: 'Сотрудник',
}

export const permissionRows = [
  { key: 'reportEdit', label: 'Редактирование отчета' },
  { key: 'productsManage', label: 'Управление ассортиментом' },
  { key: 'scheduleManage', label: 'Управление графиком' },
  { key: 'auditView', label: 'Просмотр истории изменений' },
  { key: 'rolesManage', label: 'Настройка ролей' },
]

export const defaultPermissionsByRole = (role) => {
  if (role === 'admin') {
    return {
      reportEdit: true,
      productsManage: true,
      scheduleManage: true,
      auditView: true,
      rolesManage: true,
    }
  }

  if (role === 'chef') {
    return {
      reportEdit: true,
      productsManage: false,
      scheduleManage: false,
      auditView: false,
      rolesManage: false,
    }
  }

  return {
    reportEdit: true,
    productsManage: false,
    scheduleManage: false,
    auditView: false,
    rolesManage: false,
  }
}

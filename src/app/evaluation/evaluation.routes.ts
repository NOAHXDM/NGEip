import { Routes } from '@angular/router';
import { authGuard } from '../guards/auth.guard';
import { adminGuard } from '../guards/admin.guard';

/**
 * 評量考核系統路由定義
 * 所有路由需登入（authGuard）；管理者路由額外需要 adminGuard
 */
export const EVALUATION_ROUTES: Routes = [
  {
    path: 'evaluation',
    canActivate: [authGuard],
    children: [
      // 評核者：我的考評任務清單
      {
        path: 'tasks',
        loadComponent: () =>
          import('./pages/evaluation-tasks/evaluation-tasks.component').then(
            (c) => c.EvaluationTasksComponent
          ),
      },
      // 評核者：填寫考評表
      {
        path: 'tasks/:assignmentId/form',
        loadComponent: () =>
          import('./pages/evaluation-form/evaluation-form.component').then(
            (c) => c.EvaluationFormComponent
          ),
      },
      // 受評者：我的職場屬性報告
      {
        path: 'my-report',
        loadComponent: () =>
          import('./pages/attribute-report/attribute-report.component').then(
            (c) => c.AttributeReportComponent
          ),
      },
      // 管理者：考核週期管理
      {
        path: 'admin/cycles',
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            './pages/evaluation-cycles-admin/evaluation-cycles-admin.component'
          ).then((c) => c.EvaluationCyclesAdminComponent),
      },
      // 管理者：評核總覽（含排名視圖）
      {
        path: 'admin/overview',
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            './pages/evaluation-overview-admin/evaluation-overview-admin.component'
          ).then((c) => c.EvaluationOverviewAdminComponent),
      },
      // 預設重導至任務清單
      {
        path: '',
        redirectTo: 'tasks',
        pathMatch: 'full',
      },
    ],
  },
];

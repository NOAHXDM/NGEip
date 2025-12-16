import { Routes } from '@angular/router';
import { authGuard, noAuthGuard } from './guards/auth.guard';
import { HomeComponent } from './home/home.component';
import { LayoutComponent } from './layout/layout.component';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { SystemConfigComponent } from './system-config/system-config.component';
import { UserProfileComponent } from './user-profile/user-profile.component';
import { UserListComponent } from './user-list/user-list.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: HomeComponent },
      { path: 'MyProfile', component: UserProfileComponent },
      { path: 'SystemConfig', component: SystemConfigComponent },
      { path: 'Users', component: UserListComponent },
      {
        path: 'Subsidy',
        children: [
          { path: '', redirectTo: 'List', pathMatch: 'full' },
          {
            path: 'List',
            loadComponent: () =>
              import('./subsidy/subsidy-list/subsidy-list.component').then(
                (c) => c.SubsidyListComponent
              ),
          },
          {
            path: 'Stats',
            loadComponent: () =>
              import('./subsidy/subsidy-stats/subsidy-stats.component').then(
                (c) => c.SubsidyStatsComponent
              ),
          },
          {
            path: 'Meals',
            loadComponent: () =>
              import(
                './subsidy/meal-subsidy/meal-list/meal-list.component'
              ).then((c) => c.MealListComponent),
          },
          {
            path: 'Meals/MyStats',
            loadComponent: () =>
              import(
                './subsidy/meal-subsidy/user-meal-stats/user-meal-stats.component'
              ).then((c) => c.UserMealStatsComponent),
          },
        ],
      },
    ],
  },
  { path: 'Login', component: LoginComponent, canActivate: [noAuthGuard] },
  {
    path: 'Register',
    component: RegisterComponent,
    canActivate: [noAuthGuard],
  },
  {
    path: 'CodeLab',
    loadComponent: () =>
      import('./codelab/codelab.component').then((c) => c.CodelabComponent),
  },
];

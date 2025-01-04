import { Routes } from '@angular/router';
import { authGuard, noAuthGuard } from './guards/auth.guard';
import { HomeComponent } from './home/home.component';
import { LayoutComponent } from './home/layout/layout.component';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { UserProfileComponent } from './user-profile/user-profile.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: HomeComponent },
      { path: 'MyProfile', component: UserProfileComponent },
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

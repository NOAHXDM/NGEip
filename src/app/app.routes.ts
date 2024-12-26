import { Routes } from '@angular/router';
import { CodelabComponent } from './codelab/codelab.component';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/login.component';
import { authGuard, noAuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent, canActivate: [authGuard] },
  { path: 'Login', component: LoginComponent, canActivate: [noAuthGuard] },
  { path: 'CodeLab', component: CodelabComponent },
];

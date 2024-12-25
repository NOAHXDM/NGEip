import { Routes } from '@angular/router';
import { CodelabComponent } from './codelab/codelab.component';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/login.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'Login', component: LoginComponent },
  { path: 'CodeLab', component: CodelabComponent },
];

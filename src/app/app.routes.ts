import { Routes } from '@angular/router';
import { CodelabComponent } from './codelab/codelab.component';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/login.component';
import { TextComponent } from './text/text.component';
import { yourGuardGuard } from './your-guard.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent, canActivate: [yourGuardGuard] },
  { path: 'Login', component: LoginComponent },
  { path: 'CodeLab', component: CodelabComponent },
  { path: 'Text', component: TextComponent, canActivate: [yourGuardGuard] },
];

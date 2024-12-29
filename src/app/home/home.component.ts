import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { take } from 'rxjs';

import { UserService } from '../services/user.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  private userService = inject(UserService);
  private _router = inject(Router);

  logout() {
    this.userService.logout()
      .pipe(
        take(1),
      )
      .subscribe({
        next: () => this._router.navigate(['/Login']),
        error: (error) => {},
      })
  }
}

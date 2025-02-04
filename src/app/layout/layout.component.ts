import { AsyncPipe } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Observable, take } from 'rxjs';
import { UserProfileComponent } from '../user-profile/user-profile.component';
import { UserService } from '../services/user.service';
import { User } from '../services/user.service';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    AsyncPipe,
    RouterLink,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatToolbarModule,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  readonly isAdmin$: Observable<boolean>;
  user: User | null = null;
  constructor(
    private userService: UserService,
    private _router: Router,
    private _dialog: MatDialog
  ) {
    this.isAdmin$ = this.userService.isAdmin$;
  }

  logout() {
    this.userService
      .logout()
      .pipe(take(1))
      .subscribe({
        next: () => this._router.navigate(['/Login']),
        error: (error) => {},
      });
  }

  openMemberDialog() {
    this.isAdmin$.pipe(take(1)).subscribe({
      next: (isAdmin) => {
        if (isAdmin) {
          const dialogRef = this._dialog.open(UserProfileComponent, {
            data: { user: this.user },
            width: '65vw',
          });
        }
      },
    });
  }
}

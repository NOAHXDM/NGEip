import { Component, Input } from '@angular/core';
import { Observable, take } from 'rxjs';
import { MatBadgeModule } from '@angular/material/badge';
import { User, UserService } from '../services/user.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { UserProfileComponent } from '../user-profile/user-profile.component';
import { MatIconModule } from '@angular/material/icon';
@Component({
  selector: 'app-user-card-easy',
  standalone: true,
  imports: [MatIconModule, MatDialogModule, MatBadgeModule],
  templateUrl: './user-card-easy.component.html',
  styleUrl: './user-card-easy.component.scss',
})
export class UserCardEasyComponent {
  @Input() user!: User;
  readonly isAdmin$: Observable<boolean>;

  constructor(private userService: UserService, private _dialog: MatDialog) {
    this.isAdmin$ = this.userService.isAdmin$;
  }
  openUserProfileDialog() {
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

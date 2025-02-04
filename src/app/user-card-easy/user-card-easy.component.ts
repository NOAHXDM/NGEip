import { Component, Input } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Observable, take } from 'rxjs';

import { User, UserService } from '../services/user.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { UserProfileComponent } from '../user-profile/user-profile.component';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-user-card-easy',
  standalone: true,
  imports: [MatIconModule, AsyncPipe, MatDialogModule],
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

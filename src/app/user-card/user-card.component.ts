import { AsyncPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';

import { User, UserService } from '../services/user.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { UserProfileComponent } from '../user-profile/user-profile.component';

@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [AsyncPipe, MatDialogModule],
  templateUrl: './user-card.component.html',
  styleUrl: './user-card.component.scss',
})
export class UserCardComponent {
  @Input() user!: User;
  readonly isAdmin$: Observable<boolean>;

  constructor(private userService: UserService, private _dialog: MatDialog) {
    this.isAdmin$ = this.userService.isAdmin$;
  }

  openUserProfileDialog() {
    const dialogRef = this._dialog.open(UserProfileComponent, {
      data: { user: this.user },
      width: '65vw',
    });
  }
}

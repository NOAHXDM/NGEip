import { AsyncPipe } from '@angular/common';
import { Component, OnInit, Inject } from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Timestamp } from '@angular/fire/firestore';
import { MatButtonModule, MatIconButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { provideNativeDateAdapter } from '@angular/material/core';
import { Observable } from 'rxjs';

import {
  DailyMealRecord,
  MealEntry,
  MealSubsidyService,
} from '../../../services/meal-subsidy.service';
import { UserService, User } from '../../../services/user.service';
import { UserNamePipe } from '../../../pipes/user-name.pipe';

@Component({
  selector: 'app-meal-daily-form',
  standalone: true,
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatIconModule,
    UserNamePipe,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './meal-daily-form.component.html',
  styleUrl: './meal-daily-form.component.scss',
})
export class MealDailyFormComponent implements OnInit {
  mealForm = new FormGroup({
    date: new FormControl(new Date(), [Validators.required]),
    meals: new FormArray<FormGroup>([]),
  });

  readonly userList$: Observable<User[]>;
  readonly isAdmin$: Observable<boolean>;

  get mealsArray(): FormArray {
    return this.mealForm.get('meals') as FormArray;
  }

  constructor(
    private dialogRef: MatDialogRef<MealDailyFormComponent>,
    private mealService: MealSubsidyService,
    private userService: UserService,
    @Inject(MAT_DIALOG_DATA)
    protected data: { title: string; record?: DailyMealRecord }
  ) {
    this.userList$ = this.userService.list$;
    this.isAdmin$ = this.userService.isAdmin$;
  }

  ngOnInit() {
    // 如果是編輯模式，載入現有資料
    if (this.data.record) {
      this.loadRecord(this.data.record);
    } else {
      // 新增模式：至少新增一個餐點欄位
      this.addMeal();
    }
  }

  loadRecord(record: DailyMealRecord) {
    // 設定日期
    const dateValue = (record.date as Timestamp).toDate();
    this.mealForm.patchValue({
      date: dateValue,
    });

    // 載入餐點記錄
    record.meals.forEach((meal) => {
      this.addMeal(meal);
    });
  }

  addMeal(meal?: MealEntry) {
    const mealGroup = new FormGroup({
      userId: new FormControl(meal?.userId || '', [Validators.required]),
      orderContent: new FormControl(meal?.orderContent || '', [
        Validators.required,
      ]),
      amount: new FormControl(meal?.amount || null, [
        Validators.required,
        Validators.min(0),
      ]),
    });

    this.mealsArray.push(mealGroup);
  }

  removeMeal(index: number) {
    this.mealsArray.removeAt(index);
  }

  calculateTotal(): number {
    return this.mealsArray.controls.reduce((total, control) => {
      const amount = control.get('amount')?.value || 0;
      return total + amount;
    }, 0);
  }

  onSave() {
    if (this.mealForm.invalid || this.mealsArray.length === 0) {
      return;
    }

    const formValue = this.mealForm.value;
    const date = formValue.date as Date;
    const dateId = this.mealService.formatDateId(date);
    const dayOfWeek = date.getDay();

    const meals: MealEntry[] =
      formValue.meals?.map((meal: any) => ({
        userId: meal.userId,
        orderContent: meal.orderContent,
        amount: meal.amount,
      })) || [];

    const userIds = meals.map((meal) => meal.userId);
    const dailyTotal = this.calculateTotal();

    const recordData: Omit<DailyMealRecord, 'id' | 'createdAt' | 'updatedAt'> =
      {
        date: Timestamp.fromDate(date),
        dayOfWeek,
        meals,
        dailyTotal,
        userIds,
      };

    this.mealService.saveDailyMeal(dateId, recordData).subscribe({
      next: () => {
        this.dialogRef.close('Daily meal record saved successfully!');
      },
      error: (error) => {
        console.error('Error saving meal record:', error);
        this.dialogRef.close('Failed to save meal record.');
      },
    });
  }

  onCancel() {
    this.dialogRef.close();
  }
}

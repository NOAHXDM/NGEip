import { AsyncPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Observable, firstValueFrom } from 'rxjs';

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
    MatDialogContent,
    MatDialogTitle,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatIconModule,
    MatSnackBarModule,
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
    private http: HttpClient,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA)
    protected data: { title: string; record?: DailyMealRecord; readOnly?: boolean }
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

    // 如果是唯讀模式，禁用整個表單
    if (this.data.readOnly) {
      this.mealForm.disable();
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

  /**
   * 匯入 Google Sheets 資料
   */
  async onImportFromSheet() {
    const gid = prompt('請輸入 Google Sheet GID:');
    if (!gid || !gid.trim()) {
      return;
    }

    try {
      const url = `https://docs.google.com/spreadsheets/d/1Jj63gogpfhhODBWF1KH7SMl5RP4YIujP7LQlIpIkslQ/gviz/tq?gid=${gid.trim()}&tqx=out:json`;
      this.snackBar.open('正在匯入資料...', '', { duration: 2000 });

      // 呼叫 Google Sheets API
      const response = await firstValueFrom(this.http.get(url, { responseType: 'text' }));

      // 解析回應（Google Sheets 回傳的是 JSONP 格式）
      const jsonData = this.parseGoogleSheetsResponse(response);

      // 解析工作表資料（包含日期資訊）
      const orders = this.parseSheetData(jsonData);

      if (orders.length === 0) {
        this.snackBar.open('未找到有效的訂單資料', '', { duration: 3000 });
        return;
      }

      // 取得表單中選擇的日期
      const selectedDate = this.mealForm.get('date')?.value as Date;
      const selectedDateStr = this.formatDateId(selectedDate);

      // 過濾出符合選擇日期的訂單
      const matchedOrders = orders.filter(order => order.date === selectedDateStr);

      if (matchedOrders.length === 0) {
        this.snackBar.open(
          `未找到日期 ${selectedDateStr} 的訂單資料，共找到 ${orders.length} 筆其他日期的資料`,
          '',
          { duration: 5000 }
        );
        return;
      }

      // 清空現有餐點
      while (this.mealsArray.length > 0) {
        this.mealsArray.removeAt(0);
      }

      // 將訂單填入表單
      await this.populateFormWithOrders(matchedOrders);

      this.snackBar.open(
        `成功匯入 ${matchedOrders.length} 筆 ${selectedDateStr} 的資料`,
        '',
        { duration: 3000 }
      );
    } catch (error) {
      console.error('匯入失敗:', error);
      this.snackBar.open('匯入失敗，請確認 Sheet ID 是否正確且具有公開存取權限', '', {
        duration: 5000
      });
    }
  }

  /**
   * 格式化日期為 YYYY-MM-DD
   */
  private formatDateId(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Excel 日期數值轉換為 JavaScript Date
   * 參考 lunch-order-parser.js
   */
  private excelDateToJSDate(excelDate: number): Date {
    const baseDate = new Date(1899, 11, 30);
    const days = Math.floor(excelDate);
    return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  }

  /**
   * 解析 Google Sheets API 回應
   * Google Sheets 回傳格式為 JSONP，開頭會有特殊註解標記
   */
  private parseGoogleSheetsResponse(response: string): any {
    // 先移除開頭的註解標記
    let cleaned = response.replace(/^\/\*O_o\*\/\s*\n?/, '');

    // 移除 JSONP 包裝
    cleaned = cleaned
      .replace(/^google\.visualization\.Query\.setResponse\(/, '')
      .replace(/\);?\s*$/, '');

    return JSON.parse(cleaned);
  }

  /**
   * 解析工作表資料
   * 參考 lunch-order-parser.js 的邏輯
   */
  private parseSheetData(jsonData: any): Array<{
    date: string;
    userName: string;
    orderContent: string;
    amount: number;
  }> {
    const orders: Array<{
      date: string;
      userName: string;
      orderContent: string;
      amount: number;
    }> = [];

    if (!jsonData.table || !jsonData.table.rows) {
      return orders;
    }

    const rows = jsonData.table.rows;

    if (rows.length < 3) {
      return orders;
    }

    // 第一列：日期
    const dateRow = rows[0];
    // 第二列：店家名稱
    const restaurantRow = rows[1];
    // 第三列開始：訂餐資料
    const orderRows = rows.slice(2);

    // 識別日期和店家的欄位結構
    const dateColumns: Array<{
      col: number;
      date: string;
      restaurant: string;
      nameCol: number;
      mealCol: number;
      priceCol: number;
    }> = [];

    for (let col = 0; col < dateRow.c.length; col++) {
      const cell = dateRow.c[col];
      if (cell && cell.v) {
        const dateValue = cell.v;
        let date: Date | null = null;

        // 檢查是否為日期
        if (typeof dateValue === 'number' && dateValue > 40000) {
          // Excel 數字格式
          date = this.excelDateToJSDate(dateValue);
        } else if (typeof dateValue === 'string' && dateValue.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
          // 字串格式：YYYY/MM/DD 或 YYYY/M/D
          const parts = dateValue.split('/');
          date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }

        if (date) {
          const dateStr = this.formatDateId(date);

          const restaurantCell = restaurantRow.c[col];
          const restaurant = restaurantCell?.v || restaurantCell?.f || '未命名店家';

          dateColumns.push({
            col,
            date: dateStr,
            restaurant: String(restaurant).trim(),
            nameCol: col - 1,  // 員工名稱欄位
            mealCol: col,      // 餐點名稱欄位
            priceCol: col + 1  // 價格欄位
          });
        }
      }
    }

    // 提取訂餐記錄
    for (const row of orderRows) {
      if (!row.c) continue;

      const firstCell = row.c[0];

      // 跳過統計列
      if (firstCell && firstCell.v) {
        const cellStr = String(firstCell.v).trim();
        if (['預估金額', '實際金額', '個人承擔', '公司承擔'].includes(cellStr)) {
          continue;
        }
      }

      for (const dc of dateColumns) {
        const userNameCell = row.c[dc.nameCol];
        const mealNameCell = row.c[dc.mealCol];
        const priceCell = row.c[dc.priceCol];

        const userName = userNameCell?.v || userNameCell?.f;
        const mealName = mealNameCell?.v || mealNameCell?.f;
        const price = priceCell?.v;

        // 只記錄有餐點名稱的訂單（排除 null、p、pass、怕死等）
        if (mealName && String(mealName).trim()) {
          const mealStr = String(mealName).trim().toLowerCase();
          if (!['null', 'p', 'pass', '怕死'].includes(mealStr)) {
            const orderContent = `${dc.restaurant} - ${mealName}`;

            // 處理金額：確保不超過 150
            let amount = 150; // 預設值
            if (typeof price === 'number' && !isNaN(price)) {
              amount = Math.min(price, 150);
            }

            orders.push({
              date: dc.date,
              userName: userName ? String(userName).trim() : '',
              orderContent,
              amount
            });
          }
        }
      }
    }

    return orders;
  }

  /**
   * 將訂單資料填入表單
   */
  private async populateFormWithOrders(
    orders: Array<{ userName: string; orderContent: string; amount: number }>
  ) {
    const userList = await firstValueFrom(this.userList$);

    for (const order of orders) {
      // 根據使用者名稱查找 userId
      const user = userList.find(u => u.name === order.userName);

      if (!user) {
        console.warn(`找不到使用者: ${order.userName}`);
        continue;
      }

      // 新增餐點到表單
      this.addMeal({
        userId: user.uid!,
        orderContent: order.orderContent,
        amount: order.amount
      });
    }
  }
}

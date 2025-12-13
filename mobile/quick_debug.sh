#!/bin/bash
# Quick Debug Script for Mobile App

DEVICE="HVA5K72A"

echo "=== Mobile App Debug Tool ==="
echo ""
echo "1. View all logs"
echo "2. View logout/navigation logs"
echo "3. View loading logs"
echo "4. View tab switching logs"
echo "5. Clear logs and start fresh"
echo "6. Monitor everything (logout, loading, navigation)"
echo ""
read -p "Choose option (1-6): " choice

case $choice in
  1)
    echo "Viewing all logs... (Ctrl+C to stop)"
    adb -s $DEVICE logcat
    ;;
  2)
    echo "Viewing logout/navigation logs... (Ctrl+C to stop)"
    adb -s $DEVICE logcat | grep -E "(logout|Logout|Navigation|Navigating|Login|Auth state)" --color=always
    ;;
  3)
    echo "Viewing loading logs... (Ctrl+C to stop)"
    adb -s $DEVICE logcat | grep -E "(Loading|isMessagesLoading|isUsersLoading|getUsers|getMessages|timeout)" --color=always
    ;;
  4)
    echo "Viewing tab switching logs... (Ctrl+C to stop)"
    adb -s $DEVICE logcat | grep -E "(Switching|activeTab|person|group)" --color=always
    ;;
  5)
    echo "Clearing logs..."
    adb -s $DEVICE logcat -c
    echo "Logs cleared!"
    ;;
  6)
    echo "Monitoring everything... (Ctrl+C to stop)"
    adb -s $DEVICE logcat -c
    adb -s $DEVICE logcat | grep -E "(logout|Logout|Loading|isMessagesLoading|Navigation|Navigating|Switching|ERROR|WARN)" --color=always
    ;;
  *)
    echo "Invalid option"
    ;;
esac

"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { 
  Bell, 
  CheckCircle, 
  XCircle, 
  Calendar,
  ClockIcon,
  Info,
  AlertTriangle,
  Check,
  CheckCheck,
  Trash2,
  BellRing
} from 'lucide-react';
import { EmployeeNotification } from '../types';

interface EmployeeNotificationCenterProps {
  notifications: EmployeeNotification[];
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (notificationId: string) => void;
}

const EmployeeNotificationCenter: React.FC<EmployeeNotificationCenterProps> = ({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete
}) => {
  const getNotificationIcon = (type: EmployeeNotification['type']) => {
    switch (type) {
      case 'absence_approved':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'absence_declined':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'shift_approved':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'shift_declined':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'schedule_published':
        return <Calendar className="w-4 h-4 text-blue-600" />;
      case 'schedule_updated':
        return <Calendar className="w-4 h-4 text-amber-600" />;
      case 'reminder':
        return <ClockIcon className="w-4 h-4 text-purple-600" />;
      case 'system':
        return <Info className="w-4 h-4 text-gray-600" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getPriorityColor = (priority: EmployeeNotification['priority']) => {
    switch (priority) {
      case 'high':
        return 'border-l-red-500 bg-red-50/50';
      case 'medium':
        return 'border-l-amber-500 bg-amber-50/50';
      case 'low':
        return 'border-l-blue-500 bg-blue-50/50';
      default:
        return 'border-l-gray-500 bg-gray-50/50';
    }
  };

  const formatNotificationTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}pv sitten`;
    if (hours > 0) return `${hours}h sitten`;
    if (minutes > 0) return `${minutes}min sitten`;
    return 'Juuri nyt';
  };

  const sortedNotifications = notifications.sort((a, b) => {
    // Sort by read status first (unread first), then by timestamp (newest first)
    if (a.isRead !== b.isRead) {
      return a.isRead ? 1 : -1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="space-y-6">
      <Card className="shadow-lg border-0 bg-gradient-to-r from-background to-secondary/20">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <BellRing className="w-6 h-6 text-primary" />
              <CardTitle className="text-xl text-primary">Ilmoitukset</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-3 py-1">
                {unreadCount} lukematonta
              </Badge>
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onMarkAllAsRead}
                >
                  <CheckCheck className="w-4 h-4 mr-2" />
                  Merkitse kaikki luetuiksi
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            {sortedNotifications.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-medium mb-2">Ei ilmoituksia</h3>
                <p>Kaikki ilmoitukset näkyvät täällä.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`
                      p-4 rounded-lg border-l-4 cursor-pointer transition-all hover:shadow-md
                      ${getPriorityColor(notification.priority)}
                      ${!notification.isRead ? 'bg-accent/30 shadow-sm' : 'opacity-75'}
                    `}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="flex-shrink-0 mt-0.5">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-sm truncate">
                              {notification.title}
                            </h4>
                            {!notification.isRead && (
                              <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {formatNotificationTime(notification.created_at)}
                            </span>
                            <div className="flex items-center gap-1">
                              {notification.priority === 'high' && (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Tärkeä
                                </Badge>
                              )}
                              {notification.priority === 'medium' && (
                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                                  Keskitärkeä
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkAsRead(notification.id);
                            }}
                            className="h-8 w-8 p-0 hover:bg-primary/20"
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(notification.id);
                          }}
                          className="h-8 w-8 p-0 hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Notification Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hyväksytyt</p>
                <p className="text-xl font-semibold">
                  {notifications.filter(n => n.type === 'absence_approved' || n.type === 'shift_approved').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aikataulut</p>
                <p className="text-xl font-semibold">
                  {notifications.filter(n => n.type === 'schedule_published' || n.type === 'schedule_updated').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <ClockIcon className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Muistutukset</p>
                <p className="text-xl font-semibold">
                  {notifications.filter(n => n.type === 'reminder').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Info className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Järjestelmä</p>
                <p className="text-xl font-semibold">
                  {notifications.filter(n => n.type === 'system').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Help Text */}
      <div className="text-center text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
        💡 Tärkeät ilmoitukset on merkitty punaisella. Voit merkitä ilmoituksia luetuiksi klikkaamalla ✓-painiketta.
        Saat uusia ilmoituksia poissaolopyynnöistä, vuoronvaihdoista ja aikataulupäivityksistä.
      </div>
    </div>
  );
};

export default EmployeeNotificationCenter;
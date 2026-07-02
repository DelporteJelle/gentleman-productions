import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  TextInput,
  Textarea,
  Group,
  Button,
  Stack,
  Stepper,
  NumberInput,
  Paper,
  CloseButton,
  Badge,
  Switch,
  ColorInput,
} from "@mantine/core";
import { DbObjectType, Event } from "@/types";
import { formRootRule, isNotEmpty, useForm } from "@mantine/form";
import { DateInput, TimeInput } from "@mantine/dates";
import { usePosts } from "@/app/contexts/PostsContext";

interface CreateEventModalProps {
  opened: boolean;
  onClose: () => void;
  event: Event | undefined;
}

export default function CreateEventModal({
  opened,
  onClose,
  event,
}: CreateEventModalProps) {
  const { createEvent, updateEvent } = usePosts();

  const getInitialValues = useCallback(() => {
    if (event) {
      // Convert string dates to Date objects for editing
      return {
        ...event,
        production_theme: event.production_theme ?? { accent1: "", accent2: "", bg: "", tagline: "" },
        dates: event.dates.map((date) => ({
          ...date,
          start_time: date.start_time ? new Date(date.start_time) : "",
          end_time: date.end_time ? new Date(date.end_time) : "",
        })),
      };
      // return event;
    }
    return {
      uuid: crypto.randomUUID() as string,
      created_at: new Date().toISOString(),
      updated_at: undefined,
      post_type: DbObjectType.EVENT,
      title: "",
      description: "",
      display_image: "",
      tickets_open: false,
      production_theme: { accent1: "", accent2: "", bg: "", tagline: "" },
      eventlocation: {
        country: "België",
        city: "",
        street: "",
        location: undefined,
      },
      dates: [
        {
          uuid: crypto.randomUUID(),
          start_time: new Date(),
          timeLine: [
            { time: "18:00", description: "Start" },
            { time: "22:00", description: "End" },
          ],
          price: undefined,
        },
      ],
      images: [""],
    };
  }, [event]);

  const form = useForm({
    mode: "controlled",
    initialValues: getInitialValues(),
    validate: {
      title: (value) => (value.trim() ? null : "Title is required"),
      description: (value) => (value.trim() ? null : "Description is required"),
      display_image: (value) =>
        value.trim() ? null : "Display image URL is required",
      eventlocation: {
        country: (value) => (value.trim() ? null : "Country is required"),
        city: (value) => (value.trim() ? null : "City is required"),
        street: (value) => (value.trim() ? null : "Street address is required"),
      },
      dates: (value: any) => {
        if (value.length === 0) {
          return "At least one date entry is required";
        }
        for (const date of value) {
          if (!date.start_time) {
            return "Date value is required";
          }
          for (const entry of date.timeLine) {
            if (!entry.time || !entry.description) {
              return "Time and description are required for each timeline entry";
            }
          }
          for (let i = 1; i < date.timeLine.length; i++) {
            if (date.timeLine[i] < date.timeLine[i - 1]) {
              return "Make sure the timeline entries are in order";
            }
          }
        }
        return null;
      },
    },

    // validate: (values) => {
    //   if (active === 0) {
    //     return {
    //       title: values.title.trim() ? null : "Title is required",
    //       description: values.description.trim()
    //         ? null
    //         : "Description is required",
    //       display_image: values.display_image.trim()
    //         ? null
    //         : "Display image URL is required",
    //     };
    //   }
    //   if (active === 1) {
    //     return {
    //       eventLocation: {
    //         country: values.eventLocation.country.trim()
    //           ? null
    //           : "Country is required",
    //         city: values.eventLocation.city.trim() ? null : "City is required",
    //         street: values.eventLocation.street.trim()
    //           ? null
    //           : "Street address is required",
    //         location: values.eventLocation.location.trim()
    //           ? null
    //           : "Event building or location is required",
    //       },
    //     };
    //   }
    //   if (active === 2) {
    //     return {};
    //   }

    //   return {};
    // },
  });

  const [active, setActive] = useState(0);

  // Reset form and stepper when modal opens/closes or event changes
  useEffect(() => {
    if (opened) {
      form.setValues(getInitialValues());
      setActive(0);
    }
  }, [opened, event?.uuid]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextStep = () => {
    setActive((current) => current + 1);
    // setActive((current) => {
    //   if (form.validate().hasErrors) {
    //     return current;
    //   }
    //   return current < 2 ? current + 1 : current;
    // });
  };
  const prevStep = () =>
    setActive((current) => (current > 0 ? current - 1 : current));

  const handleSubmit = useCallback(() => {
    form.validate();
    if (!form.isValid()) return;

    const eventData: Event = {
      ...form.values,
      post_type: DbObjectType.EVENT,
      updated_at: new Date().toISOString(),
      tickets_open: form.values.tickets_open ?? false,
      production_theme: (() => {
        const t = form.values.production_theme ?? {};
        const cleaned = Object.fromEntries(
          Object.entries(t).filter(([, v]) => typeof v === "string" && v.trim() !== "")
        );
        return Object.keys(cleaned).length ? cleaned : undefined;
      })(),
      dates: form.values.dates.map((date) => {
        const baseDate = new Date(date.start_time);
        if (date.timeLine.length === 0) {
          return { ...date, start_time: baseDate.toISOString(), end_time: baseDate.toISOString() };
        }
        const startTime = date.timeLine[0].time.split(":").map(Number);
        const endTime = date.timeLine[date.timeLine.length - 1].time
          .split(":")
          .map(Number);
        const startDate = new Date(baseDate);
        const endDate = new Date(baseDate);
        startDate.setHours(startTime[0], startTime[1]);
        endDate.setHours(endTime[0], endTime[1]);

        return {
          ...date,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
        };
      }),
    };
    if (event) {
      updateEvent(event.uuid, eventData);
    } else {
      createEvent(eventData);
    }
    onClose();
  }, [form, event, createEvent, updateEvent, onClose]);

  const dates = form.getValues().dates.map((date, index) => (
    <Paper key={date.uuid} p={"10"} radius="md" withBorder>
      <CloseButton
        color="red"
        onClick={() => form.removeListItem("dates", index)}
      />
      <Group grow>
        <DateInput
          required
          label="Date"
          key={form.key(`dates.${index}.start_time`)}
          {...form.getInputProps(`dates.${index}.start_time`)}
        />
        <NumberInput
          label="price"
          placeholder="Enter ticket price"
          key={form.key(`dates.${index}.price`)}
          {...form.getInputProps(`dates.${index}.price`)}
        />
      </Group>

      <Group p={10}>
        {form
          .getValues()
          .dates[index].timeLine.map((timeLineEntry, timeIndex) => (
            <Paper key={timeIndex} p={"10"} radius="md" withBorder w={150}>
              <CloseButton
                color="red"
                onClick={() =>
                  form.removeListItem(`dates.${index}.timeLine`, timeIndex)
                }
              />
              <TextInput
                label="Time"
                type="time"
                required
                key={form.key(`dates.${index}.timeLine.${timeIndex}.time`)}
                {...form.getInputProps(
                  `dates.${index}.timeLine.${timeIndex}.time`,
                )}
              />
              <TextInput
                required
                label="Description"
                placeholder="Enter description"
                key={form.key(
                  `dates.${index}.timeLine.${timeIndex}.description`,
                )}
                {...form.getInputProps(
                  `dates.${index}.timeLine.${timeIndex}.description`,
                )}
              />
            </Paper>
          ))}
      </Group>
      <Button
        variant="default"
        onClick={() => {
          form.insertListItem(`dates.${index}.timeLine`, {
            time: "",
            description: "",
          });
        }}
      >
        Add timeline entry
      </Button>
    </Paper>
  ));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={event ? "Edit Event" : "Create New Event"}
      size={"auto"}
    >
      <Stepper active={active} onStepClick={setActive}>
        {/* ====================== Event info ==================== */}
        <Stepper.Step
          color="yellow"
          label="Event info"
          description="Give the title, content and a display image."
        >
          <Stack>
            <TextInput
              required
              label="Title"
              placeholder="Enter event title"
              key={form.key("title")}
              {...form.getInputProps("title")}
            />
            <Textarea
              required
              label="Description"
              placeholder="Enter event description"
              key={form.key("description")}
              {...form.getInputProps("description")}
            />
            <Switch
              label="Tickets open"
              description="Enable when ticket sales are open"
              key={form.key("tickets_open")}
              {...form.getInputProps("tickets_open", { type: "checkbox" })}
            />
          </Stack>
        </Stepper.Step>

        {/* ====================== Event location ==================== */}

        <Stepper.Step
          color="yellow"
          label="Location"
          description="Set the event location"
        >
          <Stack>
            <TextInput
              required
              label="Country"
              placeholder="Enter country"
              key={form.key("eventlocation.country")}
              {...form.getInputProps("eventlocation.country")}
            />
            <TextInput
              required
              label="City"
              placeholder="Enter city"
              key={form.key("eventlocation.city")}
              {...form.getInputProps("eventlocation.city")}
            />
            <TextInput
              required
              label="Street"
              placeholder="Enter street address"
              key={form.key("eventlocation.street")}
              {...form.getInputProps("eventlocation.street")}
            />
            <TextInput
              label="Location"
              placeholder="Enter event building or location"
              key={form.key("eventlocation.location")}
              {...form.getInputProps("eventlocation.location")}
            />
          </Stack>
        </Stepper.Step>

        {/* ====================== Event dates ==================== */}

        <Stepper.Step
          color="yellow"
          label="Set the date"
          description="Set the event date(s)"
        >
          <Stack>
            {dates}
            <Button
              color="yellow"
              onClick={() => {
                form.insertListItem("dates", {
                  uuid: crypto.randomUUID(),
                  start_time: "",
                  end_time: "",
                  timeLine: [
                    {
                      time: "",
                      description: "Starting time",
                    },
                  ],
                  price: undefined,
                });
              }}
            >
              Add Date Entry
            </Button>
          </Stack>
        </Stepper.Step>

        {/* ====================== Event images ==================== */}

        <Stepper.Step
          color="yellow"
          label="Event images"
          description="Add display image and additional images"
        >
          <Stack>
            <TextInput
              required
              label="Image URL"
              description="Images need to be hosted externally. You can do this via onedrive by uploading the image, clicking the 3 dots (more actions), click </>embed and copy paste the URL"
              placeholder="Enter display image URL"
              key={form.key("display_image")}
              {...form.getInputProps("display_image")}
            />
            {form.getValues().images?.map((image, index) => (
              <Group key={index}>
                <TextInput
                  label={`Image URL ${index + 1}`}
                  placeholder="Enter image URL"
                  key={form.key(`images.${index}`)}
                  {...form.getInputProps(`images.${index}`)}
                />
                <CloseButton
                  color="red"
                  onClick={() => form.removeListItem("images", index)}
                />
              </Group>
            ))}
            <Button
              variant="default"
              onClick={() => form.insertListItem("images", "")}
            >
              Add Image URL
            </Button>
          </Stack>
        </Stepper.Step>

        {/* ====================== Ticket theme ==================== */}

        <Stepper.Step
          color="yellow"
          label="Ticket theme"
          description="Optional PDF ticket styling"
        >
          <Stack>
            <ColorInput
              label="Primary accent"
              format="hex"
              key={form.key("production_theme.accent1")}
              {...form.getInputProps("production_theme.accent1")}
            />
            <ColorInput
              label="Secondary accent"
              format="hex"
              key={form.key("production_theme.accent2")}
              {...form.getInputProps("production_theme.accent2")}
            />
            <ColorInput
              label="Background"
              format="hex"
              key={form.key("production_theme.bg")}
              {...form.getInputProps("production_theme.bg")}
            />
            <TextInput
              label="Tagline"
              placeholder="e.g. Storytelling in motion"
              key={form.key("production_theme.tagline")}
              {...form.getInputProps("production_theme.tagline")}
            />
          </Stack>
        </Stepper.Step>

        <Stepper.Completed>
          {/* {!form.isValid() && } */}
          {Object.keys(form.errors).length > 0 && (
            <Stack>
              {Object.entries(form.errors).map(([field, error]) => (
                <Badge key={field} color="red" variant="filled">
                  {error}
                </Badge>
              ))}
            </Stack>
          )}
        </Stepper.Completed>
      </Stepper>

      <Group justify="center" mt="xl">
        <Button variant="default" onClick={prevStep}>
          Back
        </Button>
        <Button color="red" onClick={active === 5 ? handleSubmit : nextStep}>
          {active === 5
            ? event
              ? "Update Event"
              : "Create Event"
            : "Next step"}
        </Button>
      </Group>
    </Modal>
  );
}
